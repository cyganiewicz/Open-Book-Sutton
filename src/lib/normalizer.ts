import type { ColumnMappingInput, NormalizedRow } from "@/types";
import { parseAmount } from "./format";
import { type AccountCodeConfig, applyAccountCodeConfig, resolveRevenueCategory } from "./account-codes";

export function normalizeRows(
  rawRows: Record<string, string>[],
  mappings: ColumnMappingInput[],
  accountCodeConfig?: AccountCodeConfig | null,
  dataCategory?: string
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

  const useExpenseRules = dataCategory === "expenses" && !!accountCodeConfig;
  const useRevenueRules = dataCategory === "revenues" &&
    !!accountCodeConfig?.revenueConfig &&
    (accountCodeConfig.revenueConfig.categorySegment !== null ||
     accountCodeConfig.revenueConfig.subcategorySegment !== null);

  const results: NormalizedRow[] = [];

  for (const row of rawRows) {
    let department = get(row, "department");
    const objectCode = get(row, "objectCode");
    let category1 = get(row, "category1");
    let category2 = get(row, "category2");

    // Auto-derive fields from account code if configured
    let functionArea = get(row, "functionArea");

    if (useExpenseRules && accountCodeConfig && objectCode) {
      // Expenses: derive functionArea, department, spending type, subcategory
      const derived = applyAccountCodeConfig(objectCode, department, accountCodeConfig);
      if (!functionArea) functionArea = derived.functionArea;
      if (!department) department = derived.department;
      if (!category1) category1 = derived.category1;
      if (!category2) category2 = derived.category2;
    } else if (useRevenueRules && accountCodeConfig?.revenueConfig && objectCode) {
      // Revenues: use separate revenue segment dictionary to derive category1 & category2
      const derived = resolveRevenueCategory(objectCode, accountCodeConfig.revenueConfig);
      if (!category1) category1 = derived.category1;
      if (!category2) category2 = derived.category2;
    }

    const baseRow = {
      fundCode: get(row, "fundCode"),
      fundName: get(row, "fundName"),
      department,
      departmentCode: get(row, "departmentCode"),
      functionArea,
      lineItem: get(row, "lineItem"),
      objectCode,
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
    if (/amount/i.test(key) || /budget/i.test(key) || /actual/i.test(key)) return key;
  }
  return null;
}
