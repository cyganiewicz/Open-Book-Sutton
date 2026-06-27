import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseAccountCodeConfig, resolveRevenueCategory } from "@/lib/account-codes";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ townId: string }> }
) {
  const { townId } = await params;

  const town = await prisma.town.findUnique({
    where: { id: townId },
    select: { accountCodeRules: true },
  });

  const acConfig = parseAccountCodeConfig(town?.accountCodeRules || "");


  // Get all rows, deduplicated by the key fields
  const rows = await prisma.budgetRow.findMany({
    where: { townId },
    select: {
      id: true,
      dataCategory: true,
      objectCode: true,
      lineItem: true,
      category1: true,
      category2: true,
      functionArea: true,
      department: true,
      fiscalYear: true,
      amount: true,
      amountType: true,
    },
    orderBy: [{ dataCategory: "asc" }, { fiscalYear: "desc" }],
  });

  // Deduplicate by (dataCategory, objectCode, lineItem, functionArea, department)
  const seen = new Set<string>();
  const unique = rows.filter(r => {
    const key = `${r.dataCategory}|${r.objectCode ?? ""}|${r.lineItem ?? ""}|${r.functionArea ?? ""}|${r.department ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  type UnmappedItem = {
    dataCategory: string;
    objectCode: string | null;
    lineItem: string | null;
    category1: string | null;
    functionArea: string | null;
    department: string | null;
    missingFields: string[];
    reason: string;
  };

  const unmapped: UnmappedItem[] = [];

  for (const row of unique) {
    if (row.dataCategory === "revenues") {
      // Apply account code resolution
      const derived = acConfig?.revenueConfig
        ? resolveRevenueCategory(row.objectCode, acConfig.revenueConfig)
        : { category1: null, category2: null };

      const effective1 = derived.category1 || row.category1;

      if (!effective1) {
        unmapped.push({
          dataCategory: "revenues",
          objectCode: row.objectCode,
          lineItem: row.lineItem,
          category1: null,
          functionArea: row.functionArea,
          department: row.department,
          missingFields: ["category1"],
          reason: row.objectCode
            ? `Object code "${row.objectCode}" not found in Revenue Type segment`
            : "No object code and no category mapped — will appear as (Uncategorized)",
        });
      }
    } else if (row.dataCategory === "expenses") {
      const missing: string[] = [];
      if (!row.functionArea) missing.push("Function Area");
      if (!row.department) missing.push("Department");
      // category1/category2 are skipIfEmpty so not strictly required,
      // but if functionArea AND department are both missing the row is orphaned
      if (missing.length === 2) {
        // No functionArea AND no department — will never appear in table
        unmapped.push({
          dataCategory: "expenses",
          objectCode: row.objectCode,
          lineItem: row.lineItem,
          category1: row.category1,
          functionArea: null,
          department: null,
          missingFields: missing,
          reason: "Missing Function Area and Department — row cannot be placed in table hierarchy",
        });
      } else if (!row.functionArea) {
        // Has department but no functionArea — will appear under department but not under a function
        unmapped.push({
          dataCategory: "expenses",
          objectCode: row.objectCode,
          lineItem: row.lineItem,
          category1: row.category1,
          functionArea: null,
          department: row.department,
          missingFields: ["Function Area"],
          reason: `Has department "${row.department}" but no Function Area — may appear under wrong function or be dropped`,
        });
      }
    }
  }

  // Group by dataCategory
  const byCategory: Record<string, UnmappedItem[]> = {};
  for (const item of unmapped) {
    if (!byCategory[item.dataCategory]) byCategory[item.dataCategory] = [];
    byCategory[item.dataCategory].push(item);
  }

  // Also compute totals per dataCategory for summary
  const totalsByCategory: Record<string, { rows: number; unmappedRows: number }> = {};
  for (const r of unique) {
    if (!totalsByCategory[r.dataCategory]) totalsByCategory[r.dataCategory] = { rows: 0, unmappedRows: 0 };
    totalsByCategory[r.dataCategory].rows++;
  }
  for (const item of unmapped) {
    if (totalsByCategory[item.dataCategory]) totalsByCategory[item.dataCategory].unmappedRows++;
  }

  return NextResponse.json({
    totalUnmapped: unmapped.length,
    byCategory,
    totalsByCategory,
  });
}
