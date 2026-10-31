import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseFilters, searchCheckbook } from "@/lib/checkbook/public";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ townSlug: string }> }
) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug }, select: { id: true, published: true } });
  if (!town || !town.published) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filters = parseFilters(new URL(request.url).searchParams);
  return NextResponse.json(await searchCheckbook(town.id, filters), {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
