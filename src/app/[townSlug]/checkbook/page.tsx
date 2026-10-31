export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import FinancialPageHeader from "@/components/portal/FinancialPageHeader";
import CheckbookClient from "@/components/portal/CheckbookClient";
import { getCheckbookOverview, searchCheckbook, parseFilters } from "@/lib/checkbook/public";

export default async function CheckbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ townSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { townSlug } = await params;
  const sp = await searchParams;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();
  const color = town.primaryColor || "#2d6a4f";

  const overview = await getCheckbookOverview(town.id);

  if (overview.totalPayments === 0) {
    return (
      <div>
        <FinancialPageHeader
          title="Open Checkbook"
          fiscalYear=""
          description="See who the Town pays, how much, and when — every payment, every warrant cycle."
          meta="Vendor payments by warrant cycle"
        />
        <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-5xl mb-4" aria-hidden="true">🧾</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Payments coming soon</h2>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Vendor payment data will appear here once it has been published.
          </p>
        </div>
      </div>
    );
  }

  // Deep links (?fy=…&warrant=…) work; with no year given we start on the latest fiscal year.
  const filters = parseFilters(sp);
  if (sp["fy"] === undefined) filters.fiscalYear = overview.latestFiscalYear ?? undefined;
  const initialData = await searchCheckbook(town.id, filters);

  const meta = [
    `${overview.totalPayments.toLocaleString()} payments`,
    overview.fiscalYears.length > 1 ? `FY${overview.fiscalYears[overview.fiscalYears.length - 1]}–FY${overview.fiscalYears[0]}` : `FY${overview.fiscalYears[0]}`,
  ].join(" · ");

  return (
    <div>
      <FinancialPageHeader
        title="Open Checkbook"
        fiscalYear={overview.latestFiscalYear ?? ""}
        description="See who the Town pays, how much, and when. Every vendor payment, organized by warrant cycle and searchable by vendor, department, or description."
        meta={meta}
      />
      <CheckbookClient
        townSlug={town.slug}
        color={color}
        overview={overview}
        initialData={initialData}
        initialFilters={filters}
      />
    </div>
  );
}
