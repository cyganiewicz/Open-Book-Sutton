export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import FinancialPageHeader from "@/components/portal/FinancialPageHeader";
import ReservesClient from "@/components/portal/ReservesClient";

export default async function ReservesPage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

  const allRows = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "reserves" },
    orderBy: [{ fiscalYear: "asc" }],
  });

  if (allRows.length === 0) {
    return (
      <div className="space-y-0">
        <FinancialPageHeader
          title="Reserves & Stabilization"
          fiscalYear=""
          description="Track Sutton's reserve funds, stabilization balances, and free cash across fiscal years."
          breadcrumb="OpenBook / Financial Explorer"
        />
        <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-5xl mb-4">🏦</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">No reserves data uploaded yet</h2>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            Upload reserves data from the admin panel to populate this page.
          </p>
        </div>
      </div>
    );
  }

  const color = town.primaryColor || "#2d6a4f";

  // Collect all fiscal years
  const allYears = [...new Set(allRows.map(r => r.fiscalYear))].sort();
  const latestYear = allYears[allYears.length - 1];
  const previousYear = allYears.length > 1 ? allYears[allYears.length - 2] : null;

  // Build fund list: group by fund name (lineItem or fundName field)
  // Each fund has balances across years
  type FundRow = {
    name: string;
    category: string;
    balances: Record<string, number>; // year -> amount
  };

  const fundMap = new Map<string, FundRow>();

  for (const row of allRows) {
    const name = row.lineItem || row.fundName || row.department || "Unnamed Fund";
    const category = row.category1 || "General";

    if (!fundMap.has(name)) {
      fundMap.set(name, { name, category, balances: {} });
    }
    const fund = fundMap.get(name)!;
    // Sum amounts for the same fund/year (handles budget vs actual)
    fund.balances[row.fiscalYear] = (fund.balances[row.fiscalYear] || 0) + row.amount;
  }

  const funds = [...fundMap.values()].sort((a, b) => {
    const aAmt = a.balances[latestYear] || 0;
    const bAmt = b.balances[latestYear] || 0;
    return bAmt - aAmt;
  });

  // Summary stats
  const totalLatest = funds.reduce((s, f) => s + (f.balances[latestYear] || 0), 0);
  const totalPrev = previousYear
    ? funds.reduce((s, f) => s + (f.balances[previousYear] || 0), 0)
    : null;
  const pctChange = totalPrev && totalPrev > 0
    ? ((totalLatest - totalPrev) / totalPrev) * 100
    : null;

  // Category breakdown
  const categoryMap = new Map<string, number>();
  for (const fund of funds) {
    const cat = fund.category;
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + (fund.balances[latestYear] || 0));
  }
  const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);
  const topCategory = categories[0];

  // Export data
  const exportData = funds.flatMap(fund =>
    allYears.map(year => ({
      "Fund Name": fund.name,
      "Category": fund.category,
      "Fiscal Year": year,
      "Balance": fund.balances[year] ? formatCurrency(fund.balances[year]) : "",
    }))
  );

  const metaStr = `${funds.length} fund${funds.length !== 1 ? "s" : ""} · ${allYears.length} fiscal year${allYears.length !== 1 ? "s" : ""}`;

  return (
    <div className="space-y-0">
      <FinancialPageHeader
        title="Reserves & Stabilization"
        fiscalYear={latestYear}
        description="Track Sutton's reserve funds, stabilization balances, and free cash across fiscal years."
        exportData={exportData}
        exportFilename={`${town.slug}-reserves-fy${latestYear}`}
        meta={metaStr}
      />

      <div className="space-y-8">
        {/* ── Hero: editorial 3-column layout ─────────────────── */}
        <div className="rounded-2xl overflow-hidden border border-gray-200/60 bg-white shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
            {/* Total reserves */}
            <div className="px-7 py-6">
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color }}
              >
                FY{latestYear} Total Reserves
              </p>
              <p
                className="text-5xl font-bold tabular-nums text-gray-900 tracking-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {abbreviateCurrency(totalLatest)}
              </p>
              {pctChange !== null && (
                <div className="flex items-center gap-2 mt-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                      pctChange >= 0
                        ? "text-emerald-700 bg-emerald-50"
                        : "text-red-700 bg-red-50"
                    }`}
                  >
                    {pctChange >= 0 ? "▲" : "▼"} {Math.abs(pctChange).toFixed(1)}%
                  </span>
                  <span className="text-sm text-gray-400">
                    vs. {abbreviateCurrency(totalPrev!)} prior year
                  </span>
                </div>
              )}
            </div>

            {/* Top fund */}
            {funds[0] && (
              <div className="px-7 py-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Largest Reserve Fund
                </p>
                <p
                  className="text-xl font-bold text-gray-900"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {funds[0].name}
                </p>
                <p
                  className="text-3xl font-bold tabular-nums mt-1"
                  style={{ color, fontFamily: "var(--font-display)" }}
                >
                  {abbreviateCurrency(funds[0].balances[latestYear] || 0)}
                </p>
                {totalLatest > 0 && (
                  <p className="text-sm text-gray-400 mt-1">
                    {(((funds[0].balances[latestYear] || 0) / totalLatest) * 100).toFixed(0)}% of total reserves
                  </p>
                )}
              </div>
            )}

            {/* Context */}
            <div className="px-7 py-6 bg-gray-50/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                Reserve Context
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                Reserve funds provide financial stability and reduce reliance on borrowing for
                unexpected expenses, capital needs, and fiscal emergencies.
              </p>
              {topCategory && totalLatest > 0 && (
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  {topCategory[0]} funds represent{" "}
                  {((topCategory[1] / totalLatest) * 100).toFixed(0)}% of FY{latestYear} reserves.
                </p>
              )}
            </div>
          </div>

          {/* Proportional fund strip */}
          {funds.length > 0 && totalLatest > 0 && (
            <div className="px-7 pb-5 pt-3 border-t border-gray-100">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-2">
                Reserve Balance by Fund — FY{latestYear}
              </p>
              <div
                className="flex h-3 rounded-full overflow-hidden gap-px"
                role="img"
                aria-label="Reserve funds proportional breakdown"
              >
                {funds.map((fund, i) => (
                  <div
                    key={fund.name}
                    style={{
                      width: `${((fund.balances[latestYear] || 0) / totalLatest) * 100}%`,
                      backgroundColor: FUND_COLORS[i % FUND_COLORS.length],
                    }}
                    title={`${fund.name}: ${abbreviateCurrency(fund.balances[latestYear] || 0)}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
                {funds.slice(0, 7).map((fund, i) => (
                  <span key={fund.name} className="text-xs text-gray-500 flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: FUND_COLORS[i % FUND_COLORS.length] }}
                      aria-hidden
                    />
                    {fund.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Client component for charts + table ─────────────── */}
        <ReservesClient
          funds={funds}
          allYears={allYears}
          latestYear={latestYear}
          color={color}
          totalLatest={totalLatest}
          categories={categories}
        />

        {/* ── Understanding Reserves explainer ─────────────────── */}
        <div className="rounded-xl border border-gray-200/60 bg-white/60 px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Understanding Reserves
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                heading: "Stabilization Fund",
                body: "A general-purpose reserve fund that can be appropriated by a two-thirds vote of Town Meeting for any lawful purpose.",
              },
              {
                heading: "Capital Stabilization",
                body: "Funds set aside specifically for capital purchases — helps smooth major equipment and infrastructure costs over time.",
              },
              {
                heading: "Free Cash",
                body: "Certified surplus from the prior year's general fund. A one-time, non-recurring source often used for capital or tax relief.",
              },
              {
                heading: "Why Reserves Matter",
                body: "Strong reserves support the Town's bond rating, reduce borrowing costs, and provide a cushion against unexpected fiscal stress.",
              },
            ].map(item => (
              <div key={item.heading}>
                <p className="text-sm font-semibold text-gray-700 mb-1">{item.heading}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Color palette — defined here for the strip; also exported for the client component
export const FUND_COLORS = [
  "#2d6a4f",
  "#1e6091",
  "#d97706",
  "#0891b2",
  "#4a7c59",
  "#7c3aed",
  "#52796f",
  "#be185d",
  "#40916c",
  "#84a98c",
];
