import type { ColumnMappingInput, NormalizedRow } from "@/types";
import { parseAmount } from "./format";
import { inferSpendingType, inferSchoolSubcategory, getObjectCode } from "./account-codes";

export function normalizeRows(
  rawRows: Record<string, string>[],
  mappings: ColumnMappingInput[]
): NormalizedRow[] {
  const fieldMap = new Map<string, string>();
  const fyColumns: { sourceColumn: string; fiscalYear: string; amountType: string }[] = [];
  let fiscalYearColumn: string | null = null;

  for (const m of mappings) {
    if (m.targetField === "skip") continue;
    if (m.targetField === "fyAmount" && m.fiscalYear) {
      fyColumns.push({
        sourceColumn: m.sourceColumn,
        fiscalYear: m.fiscalYear,
        amountType: m.amountType || "budget",
      });
    } else if (m.targetField === "fiscalYear") {
      fiscalYearColumn = m.sourceColumn;
    } else if (m.targetField === "spendingType") {
      fieldMap.set("category1", m.sourceColumn);
    } else {
      fieldMap.set(m.targetField, m.sourceColumn);
    }
  }

  const get = (row: Record<string, string>, field: string): string | null => {
    const col = fieldMap.get(field);
    if (!col) return null;
    const val = row[col];
    const str = val != null ? String(val) : "";
    return str.trim() ? str.trim() : null;
  };

  const results: NormalizedRow[] = [];

  for (const row of rawRows) {
    // Read explicit mapped fields
    const department = get(row, "department");
    const objectCode = get(row, "objectCode");
    const accountCode = get(row, "objectCode"); // same column used as full account code

    // Explicit category mappings (may be null if not mapped)
    let category1 = get(row, "category1");
    let category2 = get(row, "category2");

    // ── Auto-categorization from account / object codes ──────────────────
    // Infer spending type (category1) from object code suffix if not already mapped
    if (!category1 && objectCode) {
      // objectCode might be the full account string (e.g. "0001-300-300-2210-00-1-00-51110")
      // or just the last segment ("51110"). Handle both.
      const objSuffix = objectCode.includes("-") ? getObjectCode(objectCode) : objectCode;
      category1 = inferSpendingType(objSuffix) || null;
    }

    // Infer school subcategory (category2) from program code embedded in account
    if (!category2 && objectCode && objectCode.includes("-")) {
      category2 = inferSchoolSubcategory(objectCode, department) || null;
    }
    // ────────────────────────────────────────────────────────────────────

    const baseRow = {
      fundCode: get(row, "fundCode"),
      fundName: get(row, "fundName"),
      department,
      departmentCode: get(row, "departmentCode"),
      functionArea: get(row, "functionArea"),
      lineItem: get(row, "lineItem"),
      objectCode: objectCode?.includes("-") ? getObjectCode(objectCode) : objectCode,
      category1,
      category2,
      purpose: get(row, "purpose"),
      fundingSource: get(row, "fundingSource"),
    };

    if (fyColumns.length > 0) {
      for (const fyCol of fyColumns) {
        const amount = parseAmount(String(row[fyCol.sourceColumn] ?? ""));
        if (amount === 0 && !row[fyCol.sourceColumn]) continue;
        results.push({
          ...baseRow,
          fiscalYear: fyCol.fiscalYear,
          amount,
          amountType: fyCol.amountType,
        });
      }
    } else if (fiscalYearColumn) {
      const amountCol = fieldMap.get("amount") || findAmountColumn(row, fieldMap);
      const fy = String(row[fiscalYearColumn] ?? "").trim() || "unknown";
      const amount = amountCol ? parseAmount(String(row[amountCol] ?? "")) : 0;
      results.push({
        ...baseRow,
        fiscalYear: fy,
        amount,
        amountType: "budget",
      });
    }
  }

  return results;
}

export function stripZeroAmountRows(rows: NormalizedRow[]): NormalizedRow[] {
  return rows.filter((row) => row.amount !== 0 && row.amount != null);
}

function findAmountColumn(
  row: Record<string, string>,
  fieldMap: Map<string, string>
): string | null {
  const mapped = new Set(fieldMap.values());
  for (const [key] of Object.entries(row)) {
    if (mapped.has(key)) continue;
    if (/amount/i.test(key) || /budget/i.test(key) || /actual/i.test(key)) {
      return key;
    }
  }
  return null;
}
