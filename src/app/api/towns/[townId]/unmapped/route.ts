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

  // Fetch uploads so we can show filename with each unmapped item
  const uploads = await prisma.upload.findMany({
    where: { townId },
    select: { id: true, fileName: true, dataCategory: true, fiscalYear: true },
  });
  const uploadMap = new Map(uploads.map(u => [u.id, u]));

  // Get one row per unique (dataCategory, uploadId, objectCode, lineItem, functionArea, department)
  const rows = await prisma.budgetRow.findMany({
    where: { townId },
    select: {
      id: true,
      dataCategory: true,
      uploadId: true,
      objectCode: true,
      lineItem: true,
      category1: true,
      category2: true,
      functionArea: true,
      department: true,
      fiscalYear: true,
    },
    orderBy: [{ dataCategory: "asc" }, { fiscalYear: "desc" }],
  });

  // Deduplicate
  const seen = new Set<string>();
  const unique = rows.filter(r => {
    const key = `${r.dataCategory}|${r.uploadId}|${r.objectCode ?? ""}|${r.lineItem ?? ""}|${r.functionArea ?? ""}|${r.department ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  type UnmappedItem = {
    dataCategory: string;
    uploadId: string;
    fileName: string;
    fiscalYear: string | null;
    objectCode: string | null;
    lineItem: string | null;
    category1: string | null;
    functionArea: string | null;
    department: string | null;
    reason: string;
  };

  const unmapped: UnmappedItem[] = [];

  for (const row of unique) {
    const upload = uploadMap.get(row.uploadId);
    const fileName = upload?.fileName ?? "Unknown file";
    const fiscalYear = upload?.fiscalYear ?? row.fiscalYear ?? null;

    if (row.dataCategory === "revenues") {
      const derived = acConfig?.revenueConfig
        ? resolveRevenueCategory(row.objectCode, acConfig.revenueConfig)
        : { category1: null, category2: null };

      const effective1 = derived.category1 || row.category1;

      if (!effective1) {
        unmapped.push({
          dataCategory: "revenues",
          uploadId: row.uploadId,
          fileName,
          fiscalYear,
          objectCode: row.objectCode,
          lineItem: row.lineItem,
          category1: null,
          functionArea: row.functionArea,
          department: row.department,
          reason: row.objectCode
            ? `Object code "${row.objectCode}" not found in Revenue Type segment`
            : "No object code and no category mapped — row will appear as (Uncategorized)",
        });
      }
    } else if (row.dataCategory === "expenses") {
      if (!row.functionArea && !row.department && !row.category1) {
        unmapped.push({
          dataCategory: "expenses",
          uploadId: row.uploadId,
          fileName,
          fiscalYear,
          objectCode: row.objectCode,
          lineItem: row.lineItem,
          category1: row.category1,
          functionArea: null,
          department: null,
          reason: "Missing Function Area and Department — row cannot be placed in table hierarchy",
        });
      } else if (!row.functionArea) {
        unmapped.push({
          dataCategory: "expenses",
          uploadId: row.uploadId,
          fileName,
          fiscalYear,
          objectCode: row.objectCode,
          lineItem: row.lineItem,
          category1: row.category1,
          functionArea: null,
          department: row.department,
          reason: `Has department "${row.department}" but no Function Area`,
        });
      }
    }
  }

  // Group by dataCategory, then by uploadId within
  const byCategory: Record<string, {
    uploadId: string;
    fileName: string;
    fiscalYear: string | null;
    items: UnmappedItem[];
  }[]> = {};

  for (const item of unmapped) {
    if (!byCategory[item.dataCategory]) byCategory[item.dataCategory] = [];
    let group = byCategory[item.dataCategory].find(g => g.uploadId === item.uploadId);
    if (!group) {
      group = { uploadId: item.uploadId, fileName: item.fileName, fiscalYear: item.fiscalYear, items: [] };
      byCategory[item.dataCategory].push(group);
    }
    group.items.push(item);
  }

  // Summary counts
  const totalsByCategory: Record<string, { totalRows: number; unmappedRows: number }> = {};
  for (const r of unique) {
    if (!totalsByCategory[r.dataCategory]) totalsByCategory[r.dataCategory] = { totalRows: 0, unmappedRows: 0 };
    totalsByCategory[r.dataCategory].totalRows++;
  }
  for (const item of unmapped) {
    if (totalsByCategory[item.dataCategory]) totalsByCategory[item.dataCategory].unmappedRows++;
  }

  return NextResponse.json({ totalUnmapped: unmapped.length, byCategory, totalsByCategory });
}
