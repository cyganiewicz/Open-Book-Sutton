"use client";

import { useState, useMemo } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  ArcElement, Tooltip, Legend,
} from "chart.js";
import { abbreviateCurrency } from "@/lib/format";
import { type HierarchyNode, type SummaryTile, fallbackSpendingType } from "@/lib/expense-types";
import { resolveSpendingType, type AccountSegment, type AccountCodeConfig } from "@/lib/account-codes";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend);

// CVD-friendly palette — varied hues, distinguishable for color vision deficiencies
const CATEGORY_COLORS = [
  "#2d6a4f", // Sutton green — Education (primary, largest)
  "#1e6091", // deep blue — Unclassified
  "#d97706", // amber — Public Safety
  "#7c3aed", // violet — Debt Service
  "#0891b2", // teal — Intergovernmental
  "#be185d", // rose — General Government
  "#4a7c59", // sage green — Public Works
  "#92400e", // brown — Human Services
  "#065f46", // dark emerald — Culture & Recreation
  "#374151", // slate — overflow
];

interface ExpenseHeaderProps {
  tiles: SummaryTile[];
  hierarchy: HierarchyNode[];
  years: string[];
  currentYear: string;
  townColor: string;
  totalBudget: number;
  prevTotal: number;
  spendingTypeSegmentIndex: number | null;
  accountSegments: AccountSegment[];
  allYearTotals?: Record<string, number>;
  expenseExplainerItems?: { heading: string; body: string }[];
}

function collectLeaves(nodes: HierarchyNode[]): { id: string; label: string; objectCode: string | null; amounts: Record<string, number> }[] {
  return nodes.flatMap(n => {
    if (n.key === "_direct" || n.isLeaf) return n.rows || [];
    return collectLeaves(n.children);
  });
}

function getSpendingType(objectCode: string | null, segments: AccountSegment[], segIdx: number | null): string | null {
  if (!objectCode) return null;
  if (segIdx !== null) {
    const cfg = { segments, spendingTypeSegment: segIdx, separator: "-" } as AccountCodeConfig;
    const r = resolveSpendingType(objectCode, cfg);
    if (r) return r;
  }
  return fallbackSpendingType(objectCode, "-");
}

function buildSpendingTypeTotals(leaves: ReturnType<typeof collectLeaves>, years: string[], segments: AccountSegment[], segIdx: number | null) {
  const map = new Map<string, Record<string, number>>();
  for (const leaf of leaves) {
    const type = getSpendingType(leaf.objectCode, segments, segIdx);
    if (!type) continue;
    if (!map.has(type)) map.set(type, Object.fromEntries(years.map(y => [y, 0])));
    const entry = map.get(type)!;
    // Always use budget amounts for chart comparisons
    for (const y of years) entry[y] = (entry[y] || 0) + (leaf.amounts[`${y}:budget`] ?? leaf.amounts[y] ?? 0);
  }
  return map;
}

function ColorSwatch({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-sm flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
      aria-hidden
    />
  );
}

export default function ExpenseHeader({
  tiles, hierarchy, years, currentYear, townColor,
  totalBudget, prevTotal, spendingTypeSegmentIndex, accountSegments,
  allYearTotals = {},
  expenseExplainerItems,
}: ExpenseHeaderProps) {
  const [drillFn, setDrillFn] = useState<string | null>(null);
  const [activePieDim, setActivePieDim] = useState<"function" | "spendingType">("function");
  const [activeChart, setActiveChart] = useState<"trend" | "growth">("trend");
  const [trendView, setTrendView] = useState<"function" | "spendingType">("function");

  const displayYears = years.slice(-5);
  const pctChange = prevTotal > 0 ? ((totalBudget - prevTotal) / prevTotal * 100) : null;

  const leaves = useMemo(() => collectLeaves(hierarchy), [hierarchy]);
  const spendingTypeTotals = useMemo(() =>
    buildSpendingTypeTotals(leaves, years, accountSegments, spendingTypeSegmentIndex),
    [leaves, years, accountSegments, spendingTypeSegmentIndex]
  );
  const spendingTypeSorted = useMemo(() =>
    [...spendingTypeTotals.entries()].sort((a, b) => (b[1][currentYear] || 0) - (a[1][currentYear] || 0)),
    [spendingTypeTotals, currentYear]
  );

  // Function area breakdown
  const fnNodes = useMemo(() =>
    hierarchy
      .filter(n => n.key !== "_direct")
      .sort((a, b) => (b.amounts[currentYear] || 0) - (a.amounts[currentYear] || 0)),
    [hierarchy, currentYear]
  );

  const topFn = fnNodes[0];
  const topFnPct = totalBudget > 0 && topFn
    ? ((topFn.amounts[currentYear] || 0) / totalBudget * 100).toFixed(0)
    : null;

  // Dynamic insights
  const insights = useMemo(() => {
    const out: string[] = [];
    if (topFn && topFnPct) {
      out.push(`${topFn.key} is the largest spending area, representing ${topFnPct}% of the FY${currentYear} budget.`);
    }
    if (pctChange !== null) {
      const dir = pctChange >= 0 ? "increased" : "decreased";
      out.push(`Total operating expenses have ${dir} by ${Math.abs(pctChange).toFixed(1)}% compared to the prior year.`);
    }
    const sortedYears = [...years].sort();
    if (sortedYears.length >= 2 && topFn) {
      const oldest = sortedYears[0];
      const newest = sortedYears[sortedYears.length - 1];
      const oldAmt = topFn.amounts[oldest] || 0;
      const newAmt = topFn.amounts[newest] || 0;
      if (oldAmt > 0 && oldAmt !== newAmt) {
        const pct = ((newAmt - oldAmt) / oldAmt * 100).toFixed(1);
        const dir = newAmt >= oldAmt ? "grown" : "declined";
        out.push(`${topFn.key} spending has ${dir} by ${Math.abs(Number(pct))}% since FY${oldest}.`);
      }
    }
    return out.slice(0, 3);
  }, [topFn, topFnPct, pctChange, currentYear, years]);

  // Trend chart — always use budget amounts for apples-to-apples comparison
  const toBudgetAmounts = (amounts: Record<string, number>, ys: string[]) =>
    Object.fromEntries(ys.map(y => [y, amounts[`${y}:budget`] ?? amounts[y] ?? 0]));

  const trendGroups = useMemo(() => {
    if (trendView === "function") {
      if (drillFn) {
        const fnNode = hierarchy.find(n => n.key === drillFn);
        return (fnNode?.children ?? [])
          .filter(n => n.key !== "_direct")
          .sort((a, b) =>
            (b.amounts[`${currentYear}:budget`] ?? b.amounts[currentYear] ?? 0) -
            (a.amounts[`${currentYear}:budget`] ?? a.amounts[currentYear] ?? 0)
          )
          .slice(0, 8)
          .map(n => ({ label: n.key, amounts: toBudgetAmounts(n.amounts, years) }));
      }
      return fnNodes.slice(0, 8).map(n => ({ label: n.key, amounts: toBudgetAmounts(n.amounts, years) }));
    } else {
      return spendingTypeSorted.slice(0, 8).map(([label, amounts]) => ({ label, amounts: toBudgetAmounts(amounts, years) }));
    }
  }, [fnNodes, hierarchy, drillFn, currentYear, trendView, spendingTypeSorted, years]);

  const growthData = useMemo(() => {
    // Only include years that have budget data — skip years with no budget upload
    const budgetYears = [...years].sort().filter(y => (allYearTotals[y] ?? 0) > 0);
    if (budgetYears.length < 2) return null;
    const dataYears = budgetYears.slice(1);
    const labels = dataYears.map(y => `FY${y}`);
    const totalGrowth = dataYears.map((y, i) => {
      const prev = allYearTotals[budgetYears[i]] || 0;
      const cur = allYearTotals[y] || 0;
      if (prev === 0) return null;
      return +((cur - prev) / prev * 100).toFixed(2);
    });
    const fnDatasets = fnNodes.slice(0, 6).map((fn, i) => ({
      label: fn.key,
      data: dataYears.map((y, idx) => {
        // Strict budget-to-budget: if no :budget key exists for a year, return null (gap) not fallback to actual
        const prev = fn.amounts[`${budgetYears[idx]}:budget`] ?? 0;
        const cur = fn.amounts[`${y}:budget`] ?? 0;
        if (prev === 0) return null;
        return +((cur - prev) / prev * 100).toFixed(2);
      }),
      borderColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      backgroundColor: "transparent",
      borderWidth: 1.5,
      pointRadius: 3,
      fill: false,
      tension: 0.3,
    }));
    const totalDataset = {
      label: "Total Budget",
      data: totalGrowth,
      borderColor: townColor,
      backgroundColor: "transparent",
      borderWidth: 2.5,
      pointRadius: 4,
      fill: false,
      tension: 0.3,
      borderDash: [6, 3],
    };
    return { labels, datasets: [...fnDatasets, totalDataset] };
  }, [fnNodes, years, allYearTotals, townColor]);

  const barData = {
    labels: displayYears.map(y => `FY${y}`),
    datasets: trendGroups.map((g, i) => ({
      label: g.label,
      data: displayYears.map(y => g.amounts[y] || 0),
      backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] + "e0",
      borderWidth: 0,
      borderRadius: 3,
    })),
  };

  // Ranked list for current view
  const rankedItems = activePieDim === "function"
    ? fnNodes.map((n, i) => ({
        label: n.key,
        amount: n.amounts[currentYear] || 0,
        pct: totalBudget > 0 ? (n.amounts[currentYear] || 0) / totalBudget * 100 : 0,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }))
    : spendingTypeSorted.map(([label, amts], i) => ({
        label,
        amount: amts[currentYear] || 0,
        pct: totalBudget > 0 ? (amts[currentYear] || 0) / totalBudget * 100 : 0,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }));

  const stripItems = activePieDim === "function" ? rankedItems : rankedItems;
  const stripTotal = stripItems.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-6">
      {/* ── Hero: editorial layout ─────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-gray-200/60 bg-white shadow-sm">
        {/* Top section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          {/* Primary total */}
          <div className="px-7 py-6">
            <p
              className="text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ color: townColor }}
            >
              FY{currentYear} Operating Budget
            </p>
            <p className="text-5xl font-bold tabular-nums text-gray-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              {abbreviateCurrency(totalBudget)}
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
                  vs. {abbreviateCurrency(prevTotal)} prior year
                </span>
              </div>
            )}
          </div>

          {/* Top function highlight */}
          {topFn && (
            <div className="px-7 py-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                Largest Function
              </p>
              <p className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
                {topFn.key}
              </p>
              <p className="text-3xl font-bold tabular-nums mt-1" style={{ color: townColor, fontFamily: "var(--font-display)" }}>
                {abbreviateCurrency(topFn.amounts[currentYear] || 0)}
              </p>
              {topFnPct && (
                <p className="text-sm text-gray-400 mt-1">{topFnPct}% of total budget</p>
              )}
            </div>
          )}

          {/* Insight */}
          <div className="px-7 py-6 bg-gray-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
              Budget Context
            </p>
            {insights.slice(0, 1).map((insight, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed">{insight}</p>
            ))}
            <div className="mt-3 space-y-1">
              {insights.slice(1).map((insight, i) => (
                <p key={i} className="text-xs text-gray-500 leading-relaxed">{insight}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Proportional category strip */}
        {rankedItems.length > 0 && stripTotal > 0 && (
          <div className="px-7 pb-5 pt-3 border-t border-gray-100">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-2">
              Budget by {activePieDim === "function" ? "Function" : "Type"}
            </p>
            <div
              className="flex h-3 rounded-full overflow-hidden gap-px"
              role="img"
              aria-label="Budget proportions by category"
            >
              {stripItems.map((item) => (
                <div
                  key={item.label}
                  style={{ width: `${(item.amount / stripTotal) * 100}%`, backgroundColor: item.color }}
                  title={`${item.label}: ${abbreviateCurrency(item.amount)} (${item.pct.toFixed(1)}%)`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
              {stripItems.slice(0, 7).map((item) => (
                <span key={item.label} className="text-xs text-gray-500 flex items-center gap-1.5">
                  <ColorSwatch color={item.color} size={8} />
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Allocation Chart + Ranked List ────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
              How the Budget Is Allocated
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">FY{currentYear} spending by category</p>
          </div>
          {/* Toggle */}
          <div
            className="flex gap-px rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
            role="group"
            aria-label="View mode"
          >
            {(["function", "spendingType"] as const).map(dim => (
              <button
                key={dim}
                onClick={() => setActivePieDim(dim)}
                className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                  activePieDim === dim
                    ? "text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
                style={activePieDim === dim ? { backgroundColor: townColor } : {}}
                aria-pressed={activePieDim === dim}
              >
                {dim === "function" ? "By Function" : "By Type"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Ranked horizontal bars */}
          <div className="lg:col-span-3 bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm">
            <div className="space-y-2">
              {rankedItems.slice(0, 9).map((item, i) => (
                <div key={item.label} className="group">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-gray-300 w-4 text-right flex-shrink-0">{i + 1}</span>
                      <ColorSwatch color={item.color} size={8} />
                      <span className="text-sm text-gray-700 font-medium truncate">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-gray-400">{item.pct.toFixed(1)}%</span>
                      <span className="text-sm font-bold tabular-nums text-gray-900 w-20 text-right">
                        {abbreviateCurrency(item.amount)}
                      </span>
                    </div>
                  </div>
                  <div className="ml-6 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.pct}%`,
                        backgroundColor: item.color,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary stats */}
          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm h-full">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
                Quick Stats
              </p>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Categories tracked</p>
                  <p className="text-2xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
                    {rankedItems.length}
                  </p>
                </div>
                {rankedItems[0] && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Largest category</p>
                    <p className="text-base font-bold text-gray-900">{rankedItems[0].label}</p>
                    <p className="text-sm text-gray-500">{rankedItems[0].pct.toFixed(1)}% · {abbreviateCurrency(rankedItems[0].amount)}</p>
                  </div>
                )}
                {rankedItems[1] && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Second largest</p>
                    <p className="text-base font-bold text-gray-900">{rankedItems[1].label}</p>
                    <p className="text-sm text-gray-500">{rankedItems[1].pct.toFixed(1)}% · {abbreviateCurrency(rankedItems[1].amount)}</p>
                  </div>
                )}
                {years.length > 1 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Years of data</p>
                    <p className="text-base font-bold text-gray-900">{years.length} fiscal years</p>
                    <p className="text-sm text-gray-500">FY{years[0]} – FY{years[years.length - 1]}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── How Spending Has Changed ───────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
              How Spending Has Changed
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Compare operating budget allocations across recent fiscal years
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Chart type toggle */}
            <div
              className="flex gap-px rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
              role="group"
              aria-label="Chart type"
            >
              {(["trend", "growth"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setActiveChart(type)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                    activeChart === type
                      ? "text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  style={activeChart === type ? { backgroundColor: townColor } : {}}
                  aria-pressed={activeChart === type}
                >
                  {type === "trend" ? "Multi-Year Trend" : "Growth Rate"}
                </button>
              ))}
            </div>
            {/* View toggle — trend only */}
            {activeChart === "trend" && (
              <div
                className="flex gap-px rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
                role="group"
              >
                {(["function", "spendingType"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => { setTrendView(v); setDrillFn(null); }}
                    className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                      trendView === v ? "text-white" : "text-gray-500 hover:text-gray-700"
                    }`}
                    style={trendView === v ? { backgroundColor: townColor } : {}}
                  >
                    {v === "function" ? "By Function" : "By Type"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm">
          {activeChart === "trend" && (
            <>
              {drillFn && trendView === "function" && (
                <button
                  onClick={() => setDrillFn(null)}
                  className="text-xs text-gray-400 hover:text-gray-700 mb-3 flex items-center gap-1 transition-colors"
                >
                  ← Back to all functions
                </button>
              )}
              {!drillFn && trendView === "function" && (
                <p className="text-xs text-gray-400 mb-3">Click a bar segment to drill into departments</p>
              )}
              <div className="h-64">
                <Bar
                  data={barData}
                  options={{
                    indexAxis: "y",
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (_e: unknown, els: { datasetIndex: number }[]) => {
                      if (els.length > 0 && !drillFn && trendView === "function") {
                        setDrillFn(trendGroups[els[0].datasetIndex]?.label ?? null);
                      }
                    },
                    plugins: {
                      legend: {
                        position: "bottom",
                        labels: {
                          boxWidth: 10,
                          boxHeight: 10,
                          font: { size: 11 },
                          padding: 10,
                          usePointStyle: true,
                          pointStyle: "rectRounded",
                        },
                      },
                      tooltip: {
                        callbacks: {
                          label: (ctx: { parsed: { x: number }; dataset: { label: string } }) =>
                            ` ${ctx.dataset.label}: ${abbreviateCurrency(ctx.parsed.x)}`,
                        },
                      },
                    },
                    scales: {
                      x: {
                        stacked: true,
                        ticks: {
                          font: { size: 11 },
                          callback: (v: number | string) => abbreviateCurrency(Number(v)),
                          color: "#9ca3af",
                        },
                        grid: { color: "#f3f4f6" },
                        border: { color: "#f3f4f6" },
                      },
                      y: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: "#6b7280" },
                      },
                    },
                  } as Parameters<typeof Bar>[0]["options"]}
                />
              </div>
            </>
          )}

          {activeChart === "growth" && growthData && (
            <>
              <p className="text-xs text-gray-400 mb-3">
                Year-over-year % change by function area ·{" "}
                <span style={{ color: townColor }} className="font-semibold">
                  — — Total Budget
                </span>
              </p>
              <div className="h-64">
                <Line
                  data={growthData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    spanGaps: false,
                    plugins: {
                      legend: {
                        position: "bottom",
                        labels: {
                          boxWidth: 10,
                          font: { size: 10 },
                          padding: 8,
                          usePointStyle: true,
                        },
                      },
                      tooltip: {
                        callbacks: {
                          label: (ctx: { parsed: { y: number | null }; dataset: { label: string } }) =>
                            ctx.parsed.y === null
                              ? ""
                              : ` ${ctx.dataset.label}: ${(ctx.parsed.y ?? 0) >= 0 ? "+" : ""}${(ctx.parsed.y ?? 0).toFixed(1)}%`,
                        },
                      },
                    },
                    scales: {
                      x: {
                        grid: { display: false },
                        ticks: { font: { size: 11 }, color: "#9ca3af" },
                      },
                      y: {
                        ticks: {
                          font: { size: 10 },
                          callback: (v: number | string) => `${Number(v).toFixed(0)}%`,
                          color: "#9ca3af",
                        },
                        grid: { color: "#f3f4f6" },
                      },
                    },
                  } as Parameters<typeof Line>[0]["options"]}
                />
              </div>
            </>
          )}

          {activeChart === "growth" && !growthData && (
            <div className="h-64 flex items-center justify-center text-sm text-gray-400">
              Need at least 2 years of data to show growth rates
            </div>
          )}
        </div>
      </div>

      {/* ── Understanding Expenses explainer ──────────────────── */}
      <div className="rounded-xl border border-gray-200/60 bg-white/60 px-6 py-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
          Understanding Expenses
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(expenseExplainerItems ?? [
            {
              heading: "Adopted Budget",
              body: "Budget figures represent planned appropriations for the fiscal year. They reflect the spending plan approved by the municipality.",
            },
            {
              heading: "Actual Spending",
              body: "Where available, actual figures reflect recorded expenditures and may differ from the adopted budget.",
            },
            {
              heading: "Exploring Data",
              body: "Click any function row in the table below to expand into departments and account-level detail.",
            },
          ]).map(item => (
            <div key={item.heading}>
              <p className="text-sm font-semibold text-gray-700 mb-1">{item.heading}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
