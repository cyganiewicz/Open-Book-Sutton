import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  groupAndSum,
  toChartData,
  detectCurrentAndPreviousYear,
} from "@/lib/aggregator";
import {
  abbreviateCurrency,
  formatCurrency,
  formatPercent,
  calculateChange,
} from "@/lib/format";
import SummaryTiles from "@/components/portal/SummaryTiles";
import PieChart from "@/components/portal/PieChart";
import BarChart from "@/components/portal/BarChart";
import type { SummaryTile } from "@/types";
import Link from "next/link";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

  const expenseRows = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "expenses" },
  });
  const revenueRows = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "revenues" },
  });
  const capitalRows = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "capital" },
  });

  const expYears = detectCurrentAndPreviousYear(expenseRows);
  const revYears = detectCurrentAndPreviousYear(revenueRows);
  const { currentYear, previousYear, allYears } = expYears;

  const currentExpenses = expenseRows.filter(
    (r) => r.fiscalYear === currentYear && r.amountType === "budget"
  );
  const prevExpenses = previousYear
    ? expenseRows.filter(
        (r) => r.fiscalYear === previousYear && (r.amountType === "budget" || r.amountType === "actual")
      )
    : [];

  const currentRevenues = revenueRows.filter(
    (r) => r.fiscalYear === revYears.currentYear && r.amountType === "budget"
  );
  const prevRevenues = revYears.previousYear
    ? revenueRows.filter(
        (r) => r.fiscalYear === revYears.previousYear && (r.amountType === "actual" || r.amountType === "budget")
      )
    : [];

  const currentCapital = capitalRows.filter(
    (r) => r.fiscalYear === currentYear
  );

  const totalExp = currentExpenses.reduce((s, r) => s + r.amount, 0);
  const totalRev = currentRevenues.reduce((s, r) => s + r.amount, 0);
  const totalCap = currentCapital.reduce((s, r) => s + r.amount, 0);
  const prevTotalExp = prevExpenses.reduce((s, r) => s + r.amount, 0);
  const prevTotalRev = prevRevenues.reduce((s, r) => s + r.amount, 0);

  const expChange = prevTotalExp > 0 ? calculateChange(prevTotalExp, totalExp) : null;
  const revChange = prevTotalRev > 0 ? calculateChange(prevTotalRev, totalRev) : null;

  const expenseByFunction = toChartData(groupAndSum(currentExpenses, "functionArea"));
  const revenueByCategory = toChartData(groupAndSum(currentRevenues, "category1"));

  const years = allYears.length > 0 ? allYears : [currentYear];
  const functions: string[] = [...new Set(currentExpenses.map((r) => r.functionArea || "Other"))];
  const trendSeries = functions.slice(0, 6).map((fn) => ({
    label: fn,
    data: years.map((y) =>
      expenseRows
        .filter((r) => r.functionArea === fn && r.fiscalYear === y && (r.amountType === "budget" || r.amountType === "actual"))
        .reduce((s, r) => s + r.amount, 0)
    ),
  }));

  const heroTiles: SummaryTile[] = [
    { label: "Total Expenses", value: abbreviateCurrency(totalExp), change: expChange ? formatPercent(expChange.percent) + " vs last year" : undefined, changeType: expChange ? (expChange.percent >= 0 ? "positive" : "negative") : undefined },
    { label: "Total Revenue", value: abbreviateCurrency(totalRev), change: revChange ? formatPercent(revChange.percent) + " vs last year" : undefined, changeType: revChange ? (revChange.percent >= 0 ? "positive" : "negative") : undefined },
    ...(totalCap > 0 ? [{ label: "Capital Projects", value: abbreviateCurrency(totalCap), change: `${currentCapital.length} projects`, changeType: "neutral" as const }] : []),
  ];

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div
        className="rounded-2xl px-6 py-8 sm:px-10 text-white"
        style={{ backgroundColor: townColor(town.primaryColor) }}
      >
        {town.logoUrl && (
          <img src={town.logoUrl} alt={`${town.name} logo`} className="h-14 w-14 object-contain mb-4 opacity-90" />
        )}
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Town of {town.name}
        </h1>
        <p className="text-white/75 mt-2 text-lg">
          FY{currentYear} Budget Portal
        </p>
        <p className="text-white/60 text-sm mt-3 max-w-xl leading-relaxed">
          Explore how your tax dollars are spent. Use the navigation above to drill into
          expenses, revenues, and capital projects — or start with the highlights below.
        </p>
        <div className="flex flex-wrap gap-3 mt-5">
          <Link href={`/${town.slug}/expenses`} className="px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-sm font-medium text-white transition-colors">
            View Expenses →
          </Link>
          <Link href={`/${town.slug}/revenues`} className="px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-sm font-medium text-white transition-colors">
            View Revenues →
          </Link>
          {totalCap > 0 && (
            <Link href={`/${town.slug}/capital`} className="px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-sm font-medium text-white transition-colors">
              Capital Projects →
            </Link>
          )}
          <Link href={`/${town.slug}/budget-book`} className="px-4 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-sm font-medium text-white transition-colors">
            Budget Book →
          </Link>
        </div>
      </div>

      {/* Top-line KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {heroTiles.map((tile) => (
          <div key={tile.label} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{tile.label}</p>
            <p className="text-3xl font-bold tracking-tight text-gray-900 mt-1">{tile.value}</p>
            {tile.change && (
              <p className={`text-sm mt-1.5 font-medium ${tile.changeType === "negative" ? "text-red-500" : tile.changeType === "positive" ? "text-emerald-600" : "text-gray-400"}`}>
                {tile.change}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Expense section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Expenses</h2>
            <p className="text-sm text-gray-500 mt-0.5">How the town spends money by function area</p>
          </div>
          <Link href={`/${town.slug}/expenses`} className="text-sm font-medium hover:underline" style={{ color: town.primaryColor }}>
            Full detail →
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PieChart data={expenseByFunction} title={`FY${currentYear} Expenses by Function`} townColor={town.primaryColor} />
          <BarChart categories={years.map((y) => `FY${y}`)} series={trendSeries} title="Expense Trend by Function" stacked />
        </div>

        {/* Top departments quick table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">Top Function Areas — FY{currentYear}</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(groupAndSum(currentExpenses, "functionArea"))
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([fn, amount]) => (
                  <tr key={fn} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-5 py-2.5 text-gray-700">{fn}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium text-gray-900">{formatCurrency(amount)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-gray-400 w-20">
                      {totalExp > 0 ? ((amount / totalExp) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Revenue section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Revenues</h2>
            <p className="text-sm text-gray-500 mt-0.5">Where the town&apos;s money comes from</p>
          </div>
          <Link href={`/${town.slug}/revenues`} className="text-sm font-medium hover:underline" style={{ color: town.primaryColor }}>
            Full detail →
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PieChart data={revenueByCategory} title={`FY${revYears.currentYear} Revenue by Category`} townColor={town.primaryColor} />
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">Revenue Sources — FY{revYears.currentYear}</p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(groupAndSum(currentRevenues, "category1"))
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([cat, amount]) => (
                    <tr key={cat} className="border-t border-gray-50 hover:bg-gray-50/50">
                      <td className="px-5 py-2.5 text-gray-700">{cat}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-medium text-gray-900">{formatCurrency(amount)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-400 w-20">
                        {totalRev > 0 ? ((amount / totalRev) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

// Darken color slightly for readability if needed
function townColor(hex: string): string {
  return hex || "#1e40af";
}
