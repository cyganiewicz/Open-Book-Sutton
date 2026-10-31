import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFilters, exportCheckbookCsv } from "@/lib/checkbook/public";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ townSlug: string }> }
) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug }, select: { id: true, published: true } });
  if (!town || !town.published) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const csv = await exportCheckbookCsv(town.id, parseFilters(new URL(request.url).searchParams));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${townSlug}-open-checkbook.csv"`,
    },
  });
}
