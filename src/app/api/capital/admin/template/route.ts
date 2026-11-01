import { NextResponse } from "next/server";
import { guarded, requireAdmin } from "@/lib/capital/http";
import { TEMPLATE_CSV } from "@/lib/capital/history";

export const dynamic = "force-dynamic";

export const GET = () => guarded(async () => {
  await requireAdmin();
  return new NextResponse(TEMPLATE_CSV, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="prior-year-capital-projects-template.csv"' } });
});
