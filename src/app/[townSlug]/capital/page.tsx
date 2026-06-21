export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { abbreviateCurrency, formatCurrency } from "@/lib/format";
import CapitalProjectList from "@/components/portal/CapitalProjectList";
import CapitalCharts from "@/components/portal/CapitalCharts";
import FinancialPageHeader from "@/components/portal/FinancialPageHeader";

export default async function CapitalPage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

  const allRows = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "capital" },
    orderBy: [{ fiscalYear: "desc" }, { amount: "desc" }],
  });

  const color = town.primaryColor || "#2d6a4f";
  const years = [...new Set(allRows.map(r => r.fiscalYear))].sort().reverse();
  const latestYear = years[0] || "";
  const latestRows = allRows.filter(r => r.fiscalYear === latestYear);

  const totalLatest = latestRows.reduce((s, r) => s + r.amount, 0);
  const totalAll = allRows.reduce((s, r) => s + r.amount, 0);

  const byDept: Record<string, number> = {};
  for (const r of latestRows) byDept[r.department || "Other"] = (byDept[r.department || "Other"] || 0) + r.amount;
  const topDepts = Object.entries(byDept).sort((a, b) => b[1] - a[1]);

  const bySource: Record<string, number> = {};
  for (const r of latestRows) bySource[r.fundingSource || "Unspecified"] = (bySource[r.fundingSource || "Unspecified"] || 0) + r.amount;
  const topSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]);

  const exportData = allRows.map(r => ({
    "Fiscal Year": r.fiscalYear,
    Department: r.department || "",
    Purpose: r.purpose || "",
    Amount: formatCurrency(r.amount),
    "Funding Source": r.fundingSource || "",
  }));

  const DEPT_COLORS = [
    "#2d6a4f","#4a7c59","#52796f","#1b4332","#74c69d",
    "#40916c","#84a98c","#b7c9b0","#1e6091","#2e86ab",
  ];

  function sourceColor(s: string): string {
    const sl = s.toLowerCase();
    if (sl.includes("free cash")) return "#40916c";
    if (sl.includes("borrow")) return "#1e6091";
    if (sl.includes("stabiliz")) return "#d97706";
    if (sl.includes("grant")) return "#0891b2";
    return "#6b7280";
  }

  const hasData = allRows.length > 0;

  const yearlyData = years.map(year => {
    const rows = allRows.filter(r => r.fiscalYear === year);
    const depts: Record<string, number> = {};
    for (const r of rows) depts[r.department || "Other"] = (depts[r.department || "Other"] || 0) + r.amount;
    return { year, depts, total: rows.reduce((s, r) => s + r.amount, 0) };
  }).reverse();

  const projectsByYear = years.map(year => ({
    year,
    projects: allRows
      .filter(r => r.fiscalYear === year)
      .sort((a, b) => b.amount - a.amount)
      .map(r => ({
        id: r.id,
        purpose: r.purpose || "Unnamed Project",
        department: r.department || null,
        amount: r.amount,
        fundingSource: r.fundingSource || null,
        description: null,
      })),
  }));

  // For hero: top funding source breakdown
  const topDept = topDepts[0];

  const metaStr = hasData
    ? `${allRows.length} projects · ${years.length} fiscal year${years.length !== 1 ? "s" : ""} · ${abbreviateCurrency(totalAll)} multi-year total`
    : undefined;

  return (
    <div className="space-y-0">
      <FinancialPageHeader
        title="Capital Projects"
        fiscalYear={latestYear}
        description="Explore Sutton's long-term investments in roads, equipment, public safety, schools, facilities, and infrastructure."
        exportData={hasData ? exportData : undefined}
        exportFilename={`${town.slug}-capital`}
        itemLabel="projects"
        meta={metaStr}
      />

      {!hasData ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-5xl mb-4">🏗️</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">No capital data uploaded yet</h2>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            Upload capital project data from the admin panel to populate this page.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── Capital Hero: editorial 3-column layout ─────── */}
          <div className="rounded-2xl overflow-hidden border border-gray-200/60 bg-white shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
              {/* Primary capital figure */}
              <div className="px-7 py-6">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-2"
                  style={{ color }}
                >
                  FY{latestYear} Capital Investment
                </p>
                <p
                  className="text-5xl font-bold tabular-nums text-gray-900 tracking-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {abbreviateCurrency(totalLatest)}
                </p>
                <p className="text-sm text-gray-400 mt-2">
                  {latestRows.length} project{latestRows.length !== 1 ? "s" : ""} this year
                </p>
              </div>

              {/* Multi-year total + top dept */}
              <div className="px-7 py-6">
                {years.length > 1 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                      Multi-Year Capital Plan
                    </p>
                    <p
                      className="text-2xl font-bold tabular-nums"
                      style={{ color, fontFamily: "var(--font-display)" }}
                    >
                      {abbreviateCurrency(totalAll)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{years.length} fiscal years</p>
                  </div>
                )}
                {topDept && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                      Top Department
                    </p>
                    <p className="text-lg font-bold text-gray-900">{topDept[0]}</p>
                    <p className="text-sm text-gray-500">{abbreviateCurrency(topDept[1])}</p>
                  </div>
                )}
              </div>

              {/* Insight */}
              <div className="px-7 py-6 bg-gray-50/50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                  Capital Context
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Capital planning helps Sutton replace critical equipment, maintain infrastructure, and prepare
                  for long-term community needs without relying solely on emergency spending.
                </p>
                {topDept && totalLatest > 0 && (
                  <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                    {topDept[0]} represents{" "}
                    {((topDept[1] / totalLatest) * 100).toFixed(0)}% of FY{latestYear} capital investment.
                  </p>
                )}
              </div>
            </div>

            {/* Proportional department strip */}
            {topDepts.length > 0 && totalLatest > 0 && (
              <div className="px-7 pb-5 pt-3 border-t border-gray-100">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-2">
                  FY{latestYear} Investment by Department
                </p>
                <div
                  className="flex h-3 rounded-full overflow-hidden gap-px"
                  role="img"
                  aria-label="Capital investment by department"
                >
                  {topDepts.map(([dept, amt], i) => (
                    <div
                      key={dept}
                      style={{
                        width: `${(amt / totalLatest) * 100}%`,
                        backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length],
                      }}
                      title={`${dept}: ${abbreviateCurrency(amt)}`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
                  {topDepts.slice(0, 6).map(([dept], i) => (
                    <span key={dept} className="text-xs text-gray-500 flex items-center gap-1.5">
                      <span
                        className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}
                        aria-hidden
                      />
                      {dept}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Charts */}
          <CapitalCharts
            byDept={topDepts}
            bySources={topSources}
            yearlyData={yearlyData}
            color={color}
            latestYear={latestYear}
          />

          {/* Capital Funding Explainer */}
          <div className="rounded-xl border border-gray-200/60 bg-white/60 px-6 py-5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
              How Capital Projects Are Funded
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  src: "Free Cash",
                  color: "#40916c",
                  body: "Certified surplus from the prior year general fund — a one-time source used for capital without increasing the tax rate.",
                },
                {
                  src: "Capital Stabilization",
                  color: "#d97706",
                  body: "A reserve fund set aside over multiple years specifically for planned capital purchases and investments.",
                },
                {
                  src: "Grants",
                  color: "#0891b2",
                  body: "Federal, state, or private grant funding received to support eligible projects — reduces the local tax burden.",
                },
                {
                  src: "Borrowing / Debt",
                  color: "#1e6091",
                  body: "Long-term bonds or notes authorized by Town Meeting for major infrastructure or facility investments.",
                },
              ].map(item => (
                <div key={item.src}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                      aria-hidden
                    />
                    <p className="text-sm font-semibold text-gray-700">{item.src}</p>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
            {/* Dynamic source summary if data provides other sources */}
            {topSources.some(([s]) => !["free cash","stabiliz","grant","borrow"].some(k => s.toLowerCase().includes(k))) && (
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                Additional funding sources in the capital plan may include enterprise funds, departmental
                budgets, and other municipal financing mechanisms.
              </p>
            )}
          </div>

          {/* Project cards */}
          <CapitalProjectList
            projectsByYear={projectsByYear}
            color={color}
            deptColors={DEPT_COLORS}
            sourceColorFn={sourceColor.toString()}
          />
        </div>
      )}
    </div>
  );
}
