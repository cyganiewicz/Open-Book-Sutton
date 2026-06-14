export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { abbreviateCurrency, formatCurrency } from "@/lib/format";
import { parseAccountCodeConfig, resolveRevenueCategory, applyAccountCodeConfig } from "@/lib/account-codes";
import { fallbackSpendingType } from "@/lib/expense-types";

export default async function TownHomePage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

  const acConfig = parseAccountCodeConfig(town.accountCodeRules || "");
  const color = town.primaryColor || "#1e40af";

  const [expenseRows, revenueRows, capitalRows] = await Promise.all([
    prisma.budgetRow.findMany({ where: { townId: town.id, dataCategory: "expenses" } }),
    prisma.budgetRow.findMany({ where: { townId: town.id, dataCategory: "revenues" } }),
    prisma.budgetRow.findMany({ where: { townId: town.id, dataCategory: "capital" }, orderBy: [{ fiscalYear: "desc" }, { amount: "desc" }] }),
  ]);

  const capitalYears = [...new Set(capitalRows.map(r => r.fiscalYear))].sort().reverse();
  const latestCapYear = capitalYears[0] || "";
  const latestCapRows = capitalRows.filter(r => r.fiscalYear === latestCapYear);
  const totalCapital = latestCapRows.reduce((s, r) => s + r.amount, 0);

  const { currentYear: expYear } = detectCurrentAndPreviousYear(expenseRows);
  const { currentYear: revYear } = detectCurrentAndPreviousYear(revenueRows);

  const currentExpenses = expenseRows
    .filter(r => r.fiscalYear === expYear && r.amountType === "budget")
    .map(r => {
      if (!acConfig) return r;
      const d = applyAccountCodeConfig(r.objectCode, r.department, acConfig);
      return { ...r, functionArea: d.functionArea || r.functionArea, category1: d.category1 || r.category1 };
    });

  const currentRevenues = revenueRows
    .filter(r => r.fiscalYear === revYear && r.amountType === "budget")
    .map(r => {
      if (!acConfig?.revenueConfig) return r;
      const d = resolveRevenueCategory(r.objectCode, acConfig.revenueConfig);
      return { ...r, category1: d.category1 || r.category1 };
    });

  const totalExpenses = currentExpenses.reduce((s, r) => s + r.amount, 0);
  const totalRevenues = currentRevenues.reduce((s, r) => s + r.amount, 0);

  const expByFn: Record<string, number> = {};
  for (const r of currentExpenses) expByFn[r.functionArea || "Other"] = (expByFn[r.functionArea || "Other"] || 0) + r.amount;
  const topFunctions = Object.entries(expByFn).sort((a, b) => b[1] - a[1]);

  const revByCat: Record<string, number> = {};
  for (const r of currentRevenues) revByCat[r.category1 || "Other"] = (revByCat[r.category1 || "Other"] || 0) + r.amount;
  const topRevenues = Object.entries(revByCat).sort((a, b) => b[1] - a[1]);

  const spendMap: Record<string, number> = {};
  for (const r of currentExpenses) {
    const t = fallbackSpendingType(r.objectCode, "-") || "Other";
    spendMap[t] = (spendMap[t] || 0) + r.amount;
  }
  const topSpending = Object.entries(spendMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const CHART_COLORS = ["#4f46e5","#059669","#d97706","#dc2626","#7c3aed","#0891b2","#be185d","#2563eb","#65a30d","#ea580c"];

  const hasData = totalExpenses > 0;

  return (
    <div className="space-y-6">

      {/* ── HERO ── */}
      <div className="relative overflow-hidden rounded-2xl">
        {/* Background: photo if available, otherwise solid color */}
        {town.heroImageUrl ? (
          <>
            <img src={town.heroImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${color}e0 0%, ${color}99 100%)` }} />
          </>
        ) : (
          <div className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}bb 100%)` }}>
            <div className="absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
          </div>
        )}

        <div className="relative px-8 py-10 min-h-[220px] flex flex-col justify-between">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="flex items-center gap-5">
              {town.logoUrl && (
                <img src={town.logoUrl} alt="" className="w-16 h-16 object-contain drop-shadow-lg flex-shrink-0" />
              )}
              <div>
                <p className="text-white/55 text-xs font-bold uppercase tracking-widest mb-1">
                  Municipal Budget Transparency
                </p>
                <h1 className="text-4xl font-extrabold text-white tracking-tight leading-none">
                  {town.name}
                </h1>
                <p className="text-white/65 text-sm mt-1.5 max-w-md">
                  {town.aboutText || "Explore how your tax dollars are collected and spent."}
                </p>
              </div>
            </div>

            {hasData && (
              <div className="flex flex-wrap gap-3 lg:flex-col lg:items-end">
                <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-3.5 border border-white/20 min-w-[160px]">
                  <p className="text-white/55 text-[10px] font-bold uppercase tracking-widest">FY{expYear} Budget</p>
                  <p className="text-white text-2xl font-extrabold tabular-nums mt-0.5">{abbreviateCurrency(totalExpenses)}</p>
                </div>
                {totalRevenues > 0 && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl px-5 py-3.5 border border-white/15 min-w-[160px]">
                    <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Total Revenue</p>
                    <p className="text-white/90 text-2xl font-bold tabular-nums mt-0.5">{abbreviateCurrency(totalRevenues)}</p>
                  </div>
                )}
              </div>
            )}
          </div>


        </div>
      </div>

      {/* ── NAV CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            href: `/${townSlug}/expenses`, label: "Expenses",
            value: hasData ? abbreviateCurrency(totalExpenses) : "—",
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            ),
          },
          {
            href: `/${townSlug}/revenues`, label: "Revenues",
            value: totalRevenues > 0 ? abbreviateCurrency(totalRevenues) : "—",
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
              </svg>
            ),
          },
          {
            href: `/${townSlug}/budget-book`, label: "Budget Book",
            value: "Print-ready",
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            ),
          },
          {
            href: `/${townSlug}/capital`, label: "Capital Projects",
            value: totalCapital > 0 ? abbreviateCurrency(totalCapital) : "CIP",
            icon: (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
            ),
          },
        ].map(item => (
          <Link key={item.href} href={item.href}
            className="group bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-gray-300 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg transition-colors"
                style={{ backgroundColor: `${color}12`, color }}>
                {item.icon}
              </div>
              <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 mt-1 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
              </svg>
            </div>
            <p className="font-bold text-gray-900 text-sm">{item.label}</p>
            <p className="text-sm font-semibold tabular-nums mt-0.5" style={{ color }}>{item.value}</p>
          </Link>
        ))}
      </div>

      {/* ── MAIN CONTENT ── */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Expense by function — 2 cols */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">FY{expYear} Budget by Function</h2>
                <p className="text-xs text-gray-400 mt-0.5">{topFunctions.length} areas</p>
              </div>
              <Link href={`/${townSlug}/expenses`}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: `${color}12`, color }}>
                View details →
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {topFunctions.slice(0, 8).map(([fn, amt], i) => {
                const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                return (
                  <div key={fn} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50/60 transition-colors">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate">{fn}</span>
                        <span className="text-sm font-bold text-gray-900 tabular-nums flex-shrink-0">{abbreviateCurrency(amt)}</span>
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 w-9 text-right flex-shrink-0">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
              {topFunctions.length > 8 && (
                <div className="px-6 py-3 text-center">
                  <Link href={`/${townSlug}/expenses`} className="text-sm text-gray-400 hover:text-gray-600">
                    +{topFunctions.length - 8} more →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Revenue or spending type */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-gray-900 text-sm">
                  {topRevenues.length > 0 ? `FY${revYear} Revenue Sources` : "Spending by Type"}
                </h2>
                {topRevenues.length > 0 && (
                  <Link href={`/${townSlug}/revenues`}
                    className="text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ backgroundColor: "#05966912", color: "#059669" }}>
                    View →
                  </Link>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {(topRevenues.length > 0 ? topRevenues : topSpending).slice(0, 5).map(([label, amt], i) => {
                  const total = topRevenues.length > 0 ? totalRevenues : totalExpenses;
                  const pct = total > 0 ? (amt / total) * 100 : 0;
                  const c = topRevenues.length > 0 ? "#059669" : CHART_COLORS[i % CHART_COLORS.length];
                  return (
                    <div key={label} className="px-5 py-3">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-xs font-medium text-gray-700 truncate mr-2">{label}</span>
                        <span className="text-xs font-bold text-gray-900 tabular-nums flex-shrink-0">{abbreviateCurrency(amt)}</span>
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Budget snapshot */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color }}>
                Budget Snapshot
              </p>
              <div className="space-y-2.5">
                {[
                  { label: "Total Operating Budget", value: formatCurrency(totalExpenses) },
                  ...(totalRevenues > 0 ? [{ label: "Total Revenue", value: formatCurrency(totalRevenues) }] : []),
                  { label: "Fiscal Year", value: `FY${expYear}` },
                  { label: "Expense Line Items", value: currentExpenses.length.toLocaleString() },
                  ...(totalCapital > 0 ? [{ label: `FY${latestCapYear} Capital Projects`, value: abbreviateCurrency(totalCapital) }] : []),
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-baseline gap-2">
                    <span className="text-xs text-gray-500">{item.label}</span>
                    <span className="text-xs font-bold text-gray-900 tabular-nums">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {town.contactEmail && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Questions?</p>
                <a href={`mailto:${town.contactEmail}`}
                  className="text-sm font-semibold hover:underline break-all"
                  style={{ color }}>
                  {town.contactEmail}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {!hasData && (
        <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">No budget data uploaded yet</h2>
          <p className="text-gray-500 text-sm max-w-xs mx-auto">
            Upload expense and revenue data from the admin panel to populate this dashboard.
          </p>
        </div>
      )}
    </div>
  );
}
