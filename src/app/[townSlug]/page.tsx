export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import { parseAccountCodeConfig, resolveRevenueCategory, applyAccountCodeConfig } from "@/lib/account-codes";
import { fallbackSpendingType, MUNIS_FALLBACK_MAP } from "@/lib/expense-types";

export default async function TownHomePage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

  const acConfig = parseAccountCodeConfig(town.accountCodeRules || "");

  // ── Load data ─────────────────────────────────────────────────────────────
  const [expenseRows, revenueRows] = await Promise.all([
    prisma.budgetRow.findMany({ where: { townId: town.id, dataCategory: "expenses" } }),
    prisma.budgetRow.findMany({ where: { townId: town.id, dataCategory: "revenues" } }),
  ]);

  const { currentYear: expYear } = detectCurrentAndPreviousYear(expenseRows);
  const { currentYear: revYear } = detectCurrentAndPreviousYear(revenueRows);

  // Reclassify at render time so account code changes reflect immediately
  const currentExpenses = expenseRows
    .filter(r => r.fiscalYear === expYear && r.amountType === "budget")
    .map(r => {
      if (!acConfig) return r;
      const d = applyAccountCodeConfig(r.objectCode, r.department, acConfig);
      return { ...r, functionArea: d.functionArea || r.functionArea, department: d.department || r.department, category1: d.category1 || r.category1 };
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

  // ── Expense breakdown by function ─────────────────────────────────────────
  const expByFn: Record<string, number> = {};
  for (const r of currentExpenses) {
    const fn = r.functionArea || "Other";
    expByFn[fn] = (expByFn[fn] || 0) + r.amount;
  }
  const topExpFunctions = Object.entries(expByFn)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // ── Revenue breakdown by category ─────────────────────────────────────────
  const revByCat: Record<string, number> = {};
  for (const r of currentRevenues) {
    const cat = r.category1 || "Other";
    revByCat[cat] = (revByCat[cat] || 0) + r.amount;
  }
  const topRevCategories = Object.entries(revByCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // ── Spending type breakdown ───────────────────────────────────────────────
  const spendingTypes: Record<string, number> = {};
  for (const r of currentExpenses) {
    const type = fallbackSpendingType(r.objectCode, "-") || "Other";
    spendingTypes[type] = (spendingTypes[type] || 0) + r.amount;
  }
  const topSpendingTypes = Object.entries(spendingTypes).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const color = town.primaryColor || "#1e40af";

  // ── Quick stats ───────────────────────────────────────────────────────────
  const stats = [
    { label: "Total Budget", value: abbreviateCurrency(totalExpenses), sub: `FY${expYear}`, href: `/${townSlug}/expenses` },
    { label: "Total Revenue", value: totalRevenues > 0 ? abbreviateCurrency(totalRevenues) : "—", sub: `FY${revYear}`, href: `/${townSlug}/revenues` },
    { label: "Largest Function", value: topExpFunctions[0]?.[0] || "—", sub: topExpFunctions[0] ? abbreviateCurrency(topExpFunctions[0][1]) : "", href: `/${townSlug}/expenses` },
    { label: "Largest Revenue Source", value: topRevCategories[0]?.[0] || "—", sub: topRevCategories[0] ? abbreviateCurrency(topRevCategories[0][1]) : "", href: `/${townSlug}/revenues` },
  ];

  const navItems = [
    { href: `/${townSlug}/expenses`, label: "Expenses", icon: "📊", desc: "Detailed expense breakdown by department and function" },
    { href: `/${townSlug}/revenues`, label: "Revenues", icon: "💰", desc: "Revenue sources and trends" },
    { href: `/${townSlug}/budget-book`, label: "Budget Book", icon: "📖", desc: "Print-ready summary of the full budget" },
    { href: `/${townSlug}/capital`, label: "Capital Projects", icon: "🏗️", desc: "Multi-year capital improvement plan" },
  ];

  return (
    <div className="space-y-10">

      {/* ── Hero ── */}
      <div className="rounded-2xl overflow-hidden shadow-md relative"
        style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}bb 100%)` }}>
        <div className="px-8 py-10">
          {town.logoUrl && (
            <img src={town.logoUrl} alt={`${town.name} seal`}
              className="w-16 h-16 object-contain mb-4 opacity-90" />
          )}
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">
            Municipal Budget Transparency
          </p>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">{town.name}</h1>
          <p className="text-white/70 text-lg max-w-xl">
            {town.aboutText || "Explore the full municipal budget — revenues, expenses, and capital projects."}
          </p>
          {totalExpenses > 0 && (
            <div className="mt-6 inline-flex items-center gap-2 bg-white/15 rounded-xl px-4 py-2.5">
              <span className="text-white/70 text-sm">FY{expYear} Budget</span>
              <span className="text-white text-2xl font-bold tabular-nums">{abbreviateCurrency(totalExpenses)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Link key={s.label} href={s.href}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow group">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors truncate"
              style={{ color: s.value.length < 8 ? color : undefined }}>{s.value}</p>
            {s.sub && <p className="text-xs text-gray-400 mt-1">{s.sub}</p>}
          </Link>
        ))}
      </div>

      {/* ── Navigation cards ── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Explore the Budget</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className="group bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all hover:border-gray-300">
              <div className="text-2xl mb-3">{item.icon}</div>
              <p className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors mb-1"
                style={{ color: undefined }}>{item.label}</p>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Two column breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Expense breakdown */}
        {topExpFunctions.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-900">FY{expYear} Expenses by Function</h2>
              <Link href={`/${townSlug}/expenses`}
                className="text-xs text-gray-400 hover:text-gray-600">View all →</Link>
            </div>
            <div className="space-y-3">
              {topExpFunctions.map(([fn, amt]) => {
                const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                return (
                  <div key={fn}>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-sm text-gray-700 truncate mr-2">{fn}</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">{abbreviateCurrency(amt)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}% of total</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Revenue breakdown or spending type fallback */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          {topRevCategories.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-gray-900">FY{revYear} Revenue by Category</h2>
                <Link href={`/${townSlug}/revenues`}
                  className="text-xs text-gray-400 hover:text-gray-600">View all →</Link>
              </div>
              <div className="space-y-3">
                {topRevCategories.map(([cat, amt]) => {
                  const pct = totalRevenues > 0 ? (amt / totalRevenues) * 100 : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm text-gray-700 truncate mr-2">{cat}</span>
                        <span className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">{abbreviateCurrency(amt)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: "#059669" }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}% of total</p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-gray-900">FY{expYear} Spending by Type</h2>
              </div>
              <div className="space-y-3">
                {topSpendingTypes.map(([type, amt]) => {
                  const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                  return (
                    <div key={type}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm text-gray-700 truncate mr-2">{type}</span>
                        <span className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">{abbreviateCurrency(amt)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}% of budget</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Contact / About ── */}
      {(town.contactEmail || town.aboutText) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 flex flex-col sm:flex-row gap-6 items-start">
          {town.aboutText && (
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900 mb-2">About This Budget</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{town.aboutText}</p>
            </div>
          )}
          {town.contactEmail && (
            <div className="flex-shrink-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Questions?</p>
              <a href={`mailto:${town.contactEmail}`}
                className="text-sm font-medium hover:underline"
                style={{ color }}>
                {town.contactEmail}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
