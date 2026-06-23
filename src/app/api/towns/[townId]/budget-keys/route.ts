import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ townId: string }> }
) {
  const { townId } = await params;
  const { searchParams } = new URL(request.url);
  const dataCategory = searchParams.get("dataCategory");

  const where = dataCategory
    ? { townId, dataCategory }
    : { townId };

  const rows = await prisma.budgetRow.findMany({
    where,
    select: { functionArea: true, category1: true, lineItem: true, dataCategory: true },
  });

  // Collect unique categories and line items
  const categorySet = new Set<string>();
  const lineItemSet = new Set<string>();

  for (const row of rows) {
    if (row.functionArea) categorySet.add(row.functionArea);
    if (row.category1) categorySet.add(row.category1);
    if (row.lineItem) lineItemSet.add(row.lineItem);
  }

  // Also return which dataCategorys exist
  const allRows = await prisma.budgetRow.findMany({
    where: { townId },
    select: { dataCategory: true },
    distinct: ["dataCategory"],
  });
  const dataCategories = allRows.map(r => r.dataCategory).filter(Boolean);

  return NextResponse.json({
    categories: [...categorySet].sort(),
    lineItems: [...lineItemSet].sort(),
    dataCategories,
  });
}
