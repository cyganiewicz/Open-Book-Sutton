export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { abbreviateCurrency, formatCurrency } from "@/lib/format";
import ExportButton from "@/components/portal/ExportButton";
import CapitalProjectList from "@/components/portal/CapitalProjectList";
import CapitalCharts from "@/components/portal/CapitalCharts";

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

  const DEPT_COLORS = ["#4f46e5","#059669","#d97706","#dc2626","#7c3aed","#0891b2","#be185d","#2563eb","#65a30d","#ea580c"];

  function sourceColor(s: string): string {
    const sl = s.toLowerCase();
    if (sl.includes("free cash")) return "#059669";
    if (sl.includes("borrow")) return "#4f46e5";
    if (sl.includes("stabiliz")) return "#d97706";
    if (sl.includes("grant")) return "#0891b2";
    return "#6b7280";
  }

  const hasData = allRows.length > 0;

  // Yearly data for stacked bar chart
  const yearlyData = years.map(year => {
    const rows = allRows.filter(r => r.fiscalYear === year);
    const depts: Record<string, number> = {};
    for (const r of rows) depts[r.department || "Other"] = (depts[r.department || "Other"] || 0) + r.amount;
    return { year, depts, total: rows.reduce((s, r) => s + r.amount, 0) };
  }).reverse(); // chronological

  // Prepare data for client component
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Capital Projects</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {hasData
              ? `${allRows.length} projects · ${years.length} fiscal year${years.length !== 1 ? "s" : ""} · ${abbreviateCurrency(totalAll)} total`
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
            style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}bb 100%)` }}>
            <div className="px-8 py-7 flex flex-wrap gap-8 items-end">
              <div>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1">FY{latestYear} Capital</p>
                <p className="text-white text-4xl font-extrabold tabular-nums">{abbreviateCurrency(totalLatest)}</p>
                <p className="text-white/60 text-xs mt-1">{latestRows.length} project{latestRows.length !== 1 ? "s" : ""}</p>
              </div>
              {years.length > 1 && (
                <div className="border-l border-white/20 pl-8">
                  <p className="text-white/50 text-[10px] uppercase tracking-wide font-medium">Multi-Year Total</p>
                  <p className="text-white text-2xl font-bold mt-0.5">{abbreviateCurrency(totalAll)}</p>
                  <p className="text-white/50 text-xs mt-0.5">{years.length} years</p>
                </div>
              )}
              {topDepts[0] && (
                <div className="border-l border-white/20 pl-8">
                  <p className="text-white/50 text-[10px] uppercase tracking-wide font-medium">Top Department</p>
                  <p className="text-white text-lg font-bold mt-0.5">{topDepts[0][0]}</p>
                  <p className="text-white/50 text-xs mt-0.5">{abbreviateCurrency(topDepts[0][1])}</p>
                </div>
              )}
            </div>

            {topDepts.length > 0 && totalLatest > 0 && (
              <div className="px-8 pb-5">
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                  {topDepts.map(([dept, amt], i) => (
                    <div key={dept}
                      style={{ width: `${(amt / totalLatest) * 100}%`, backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}
                      title={`${dept}: ${abbreviateCurrency(amt)}`} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {topDepts.slice(0, 5).map(([dept, amt], i) => (
                    <span key={dept} className="text-white/55 text-xs flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }} />
                      {dept}: {abbreviateCurrency(amt)}
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

          {/* Project cards — client component for expand/collapse */}
          <CapitalProjectList
            projectsByYear={projectsByYear}
            color={color}
            deptColors={DEPT_COLORS}
            sourceColorFn={sourceColor.toString()}
          />
        </>
      )}
    </div>
  );
}
