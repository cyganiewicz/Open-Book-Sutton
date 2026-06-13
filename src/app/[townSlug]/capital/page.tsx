export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { abbreviateCurrency, formatCurrency } from "@/lib/format";
import ExportButton from "@/components/portal/ExportButton";

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

  const color = town.primaryColor || "#1e40af";

  const years = [...new Set(allRows.map(r => r.fiscalYear))].sort().reverse();
  const latestYear = years[0] || "";
  const latestRows = allRows.filter(r => r.fiscalYear === latestYear);

  const totalLatest = latestRows.reduce((s, r) => s + r.amount, 0);
  const totalAll = allRows.reduce((s, r) => s + r.amount, 0);

  // Dept breakdown
  const byDept: Record<string, number> = {};
  for (const r of latestRows) {
    const d = r.department || "Other";
    byDept[d] = (byDept[d] || 0) + r.amount;
  }
  const topDepts = Object.entries(byDept).sort((a, b) => b[1] - a[1]);

  // Funding source breakdown
  const bySource: Record<string, number> = {};
  for (const r of latestRows) {
    const s = r.fundingSource || "Unspecified";
    bySource[s] = (bySource[s] || 0) + r.amount;
  }
  const topSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]);

  const exportData = allRows.map(r => ({
    "Fiscal Year": r.fiscalYear,
    Department: r.department || "",
    Purpose: r.purpose || "",
    Amount: formatCurrency(r.amount),
    "Funding Source": r.fundingSource || "",
  }));

  const DEPT_COLORS = [
    "#4f46e5","#059669","#d97706","#dc2626","#7c3aed",
    "#0891b2","#be185d","#2563eb","#65a30d","#ea580c",
  ];

  const SOURCE_COLORS: Record<string, string> = {
    "Free Cash": "#059669",
    "Borrowing": "#4f46e5",
    "Stabilization": "#d97706",
    "Grant": "#0891b2",
    "Unspecified": "#9ca3af",
  };
  function sourceColor(s: string): string {
    for (const [k, v] of Object.entries(SOURCE_COLORS)) {
      if (s.toLowerCase().includes(k.toLowerCase())) return v;
    }
    return "#6b7280";
  }

  const hasData = allRows.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Capital Projects</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {hasData
              ? `${allRows.length} projects across ${years.length} fiscal year${years.length !== 1 ? "s" : ""} · ${abbreviateCurrency(totalAll)} total`
              : "One-time investments in equipment, infrastructure, and facilities"}
          </p>
        </div>
        {hasData && <ExportButton data={exportData} filename={`${town.slug}-capital`} />}
      </div>

      {!hasData ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-5xl mb-4">🏗️</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">No capital data uploaded yet</h2>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            Upload capital project data from the admin panel to populate this page.
          </p>
        </div>
      ) : (
        <>
          {/* Hero */}
          <div className="rounded-2xl overflow-hidden shadow-md"
            style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` }}>
            <div className="px-8 py-8 flex flex-wrap gap-8 items-end">
              <div>
                <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">
                  FY{latestYear} Capital Budget
                </p>
                <p className="text-white text-5xl font-extrabold tabular-nums tracking-tight">
                  {abbreviateCurrency(totalLatest)}
                </p>
                <p className="text-white/60 text-sm mt-1.5">
                  {latestRows.length} project{latestRows.length !== 1 ? "s" : ""} planned
                </p>
              </div>
              {years.length > 1 && (
                <div className="border-l border-white/20 pl-8">
                  <p className="text-white/50 text-xs uppercase tracking-wide font-medium">Multi-Year Total</p>
                  <p className="text-white text-3xl font-bold mt-0.5">{abbreviateCurrency(totalAll)}</p>
                  <p className="text-white/50 text-xs mt-0.5">{years.length} years · {allRows.length} projects</p>
                </div>
              )}
              {topDepts[0] && (
                <div className="border-l border-white/20 pl-8">
                  <p className="text-white/50 text-xs uppercase tracking-wide font-medium">Largest Department</p>
                  <p className="text-white text-xl font-bold mt-0.5">{topDepts[0][0]}</p>
                  <p className="text-white/50 text-xs mt-0.5">{abbreviateCurrency(topDepts[0][1])}</p>
                </div>
              )}
            </div>

            {/* Dept proportion bar */}
            {topDepts.length > 0 && totalLatest > 0 && (
              <div className="px-8 pb-6">
                <div className="flex h-2 rounded-full overflow-hidden gap-px">
                  {topDepts.map(([dept, amt], i) => (
                    <div key={dept}
                      style={{ width: `${(amt / totalLatest) * 100}%`, backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}
                      title={`${dept}: ${abbreviateCurrency(amt)}`} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5">
                  {topDepts.slice(0, 5).map(([dept, amt], i) => (
                    <span key={dept} className="text-white/55 text-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                      {dept}: {abbreviateCurrency(amt)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Breakdown cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Department */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">FY{latestYear} by Department</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {topDepts.map(([dept, amt], i) => {
                  const pct = totalLatest > 0 ? (amt / totalLatest) * 100 : 0;
                  return (
                    <div key={dept} className="px-6 py-3.5 flex items-center gap-4">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-sm font-medium text-gray-800 truncate mr-2">{dept}</span>
                          <span className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">{abbreviateCurrency(amt)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Funding Source */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-bold text-gray-900">FY{latestYear} by Funding Source</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {topSources.map(([source, amt]) => {
                  const pct = totalLatest > 0 ? (amt / totalLatest) * 100 : 0;
                  const c = sourceColor(source);
                  return (
                    <div key={source} className="px-6 py-3.5 flex items-center gap-4">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-sm font-medium text-gray-800 truncate mr-2">{source}</span>
                          <span className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">{abbreviateCurrency(amt)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c }} />
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Projects by year */}
          <div className="space-y-6">
            {years.map(year => {
              const yearRows = allRows
                .filter(r => r.fiscalYear === year)
                .sort((a, b) => b.amount - a.amount);
              const yearTotal = yearRows.reduce((s, r) => s + r.amount, 0);
              return (
                <div key={year} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  {/* Year header */}
                  <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between"
                    style={{ background: `linear-gradient(135deg, ${color}08 0%, transparent 100%)` }}>
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-extrabold" style={{ color }}>FY{year}</div>
                      <div className="text-sm text-gray-500">{yearRows.length} project{yearRows.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">{abbreviateCurrency(yearTotal)}</div>
                      <div className="text-xs text-gray-400">total</div>
                    </div>
                  </div>

                  {/* Project rows */}
                  <div className="divide-y divide-gray-50">
                    {yearRows.map(row => {
                      const pct = yearTotal > 0 ? (row.amount / yearTotal) * 100 : 0;
                      const sc = sourceColor(row.fundingSource || "");
                      return (
                        <div key={row.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50/60 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 text-sm leading-snug">
                                  {row.purpose || "Unnamed Project"}
                                </p>
                                {row.department && (
                                  <p className="text-xs text-gray-500 mt-0.5">{row.department}</p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold text-gray-900 tabular-nums">{abbreviateCurrency(row.amount)}</p>
                                <p className="text-xs text-gray-400">{pct.toFixed(1)}% of year</p>
                              </div>
                            </div>
                            {row.fundingSource && (
                              <div className="mt-2">
                                <span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{ backgroundColor: sc + "18", color: sc }}>
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: sc }} />
                                  {row.fundingSource}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Year subtotal bar */}
                  {yearRows.length > 1 && (
                    <div className="px-6 py-3 bg-gray-50/60 border-t border-gray-100">
                      <div className="flex gap-px h-1 rounded-full overflow-hidden">
                        {yearRows.map((row, i) => (
                          <div key={row.id}
                            style={{
                              width: `${yearTotal > 0 ? (row.amount / yearTotal) * 100 : 0}%`,
                              backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length],
                            }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
