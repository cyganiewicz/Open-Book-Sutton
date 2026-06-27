import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  parseAccountCodeConfig,
  applyAccountCodeConfig,
  resolveRevenueCategory,
} from "@/lib/account-codes";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ townId: string }> }
) {
  const { townId } = await params;

  const town = await prisma.town.findUnique({
    where: { id: townId },
    select: { accountCodeRules: true },
  });

  const acConfig = parseAccountCodeConfig(town?.accountCodeRules || "");
  if (!acConfig) {
    return NextResponse.json({ error: "No account code configuration found." }, { status: 400 });
  }

  // Fetch all rows for this town
  const rows = await prisma.budgetRow.findMany({
    where: { townId },
    select: {
      id: true,
      dataCategory: true,
      objectCode: true,
      functionArea: true,
      department: true,
      category1: true,
      category2: true,
    },
  });

  let updatedCount = 0;
  const BATCH = 200;

  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const updates: { id: string; functionArea?: string | null; department?: string | null; category1?: string | null; category2?: string | null }[] = [];

    for (const row of batch) {
      if (row.dataCategory === "revenues") {
        if (!acConfig.revenueConfig) continue;
        const derived = resolveRevenueCategory(row.objectCode, acConfig.revenueConfig);
        if (!derived.category1 && !derived.category2) continue; // no mapping found, leave as-is

        const newCat1 = derived.category1 || row.category1;
        const newCat2 = derived.category2 || row.category2;
        if (newCat1 !== row.category1 || newCat2 !== row.category2) {
          updates.push({ id: row.id, category1: newCat1, category2: newCat2 });
        }
      } else if (row.dataCategory === "expenses") {
        if (!row.objectCode) continue;
        const derived = applyAccountCodeConfig(row.objectCode, acConfig);
        if (!derived.functionArea && !derived.department && !derived.category1) continue;

        const changed =
          (derived.functionArea && derived.functionArea !== row.functionArea) ||
          (derived.department && derived.department !== row.department) ||
          (derived.category1 && derived.category1 !== row.category1) ||
          (derived.category2 && derived.category2 !== row.category2);

        if (changed) {
          updates.push({
            id: row.id,
            functionArea: derived.functionArea || row.functionArea,
            department: derived.department || row.department,
            category1: derived.category1 || row.category1,
            category2: derived.category2 || row.category2,
          });
        }
      }
    }

    // Apply updates
    await Promise.all(
      updates.map(u => {
        const { id, ...data } = u;
        return prisma.budgetRow.update({ where: { id }, data });
      })
    );
    updatedCount += updates.length;
  }

  return NextResponse.json({
    success: true,
    updatedCount,
    totalRows: rows.length,
    message: `Re-applied account code mappings to ${updatedCount} of ${rows.length} rows.`,
  });
}
