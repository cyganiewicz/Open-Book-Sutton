"use client";

import { useState, useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend,
} from "chart.js";
import { abbreviateCurrency } from "@/lib/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

// Revenue palette: Sutton green anchored, with distinct supporting hues
// CVD-friendly — avoids red/green-only distinctions
const REV_COLORS = [
  "#2d6a4f", // Sutton green — Taxes & Excise (dominant)
  "#1e6091", // deep blue — State Aid
  "#d97706", // amber — Local Receipts
  "#7c3aed", // violet — Other Financing Sources
  "#0891b2", // teal
  "#be185d", // rose
  "#4a7c59", // sage
  "#374151", // slate
];

export interface RevHierarchyNode {
  key: string;
  amounts: Record<string, number>;
  children: RevHierarchyNode[];
  isLeaf: boolean;
  rows?: { id: string; label: string; amounts: Record<string, number> }[];
}

interface RevenueHeaderProps {
  hierarchy: RevHierarchyNode[];
  years: string[];
  currentYear: string;
  townColor: string;
  totalRevenue: number;
  prevTotal: number;
}

function ColorSwatch({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block rounded-sm flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
      aria-hidden
    />
  );
}

export default function RevenueHeader({
  hierarchy, years, currentYear, townColor, totalRevenue, prevTotal,
}: RevenueHeaderProps) {
  const [drillCat, setDrillCat] = useState<string | null>(null);
  const [activePieDim, setActivePieDim] = useState<"category" | "subcategory">("category");

  const displayYears = years.slice(-5);
  const pctChange = prevTotal > 0 ? ((totalRevenue - prevTotal) / prevTotal * 100) : null;

  const catTotals = useMemo(() =>
    hierarchy
      .filter(n => n.key !== "_direct")
      .map(n => ({ label: n.key, amount: n.amounts[currentYear] || 0 }))
      .sort((a, b) => b.amount - a.amount),
    [hierarchy, currentYear]
  );

  // For the ranked list view
  const rankedItems = useMemo(() => {
    if (activePieDim === "category") {
      return catTotals.map((item, i) => ({
        ...item,
        pct: totalRevenue > 0 ? (item.amount / totalRevenue) * 100 : 0,
        color: REV_COLORS[i % REV_COLORS.length],
      }));
    }
    // subcategory
    return hierarchy.flatMap(n =>
      n.children
        .filter(c => c.key !== "_direct")
        .map((c, i) => ({
          label: `${n.key} · ${c.key}`,
          amount: c.amounts[currentYear] || 0,
          pct: totalRevenue > 0 ? ((c.amounts[currentYear] || 0) / totalRevenue) * 100 : 0,
          color: REV_COLORS[i % REV_COLORS.length],
        }))
    ).sort((a, b) => b.amount - a.amount);
  }, [activePieDim, catTotals, hierarchy, currentYear, totalRevenue]);

  const hasSubcategories = hierarchy.some(n => n.children.filter(c => c.key !== "_direct").length > 0);

  // Trend data
  const trendGroups = useMemo(() => {
    if (drillCat === null) {
      return hierarchy
        .filter(n => n.key !== "_direct")
        .sort((a, b) => (b.amounts[currentYear] || 0) - (a.amounts[currentYear] || 0))
        .slice(0, 8)
        .map(n => ({ label: n.key, amounts: n.amounts }));
    }
    const catNode = hierarchy.find(n => n.key === drillCat);
    if (!catNode) return [];
    return catNode.children
      .filter(n => n.key !== "_direct")
      .sort((a, b) => (b.amounts[currentYear] || 0) - (a.amounts[currentYear] || 0))
      .slice(0, 10)
      .map(n => ({ label: n.key, amounts: n.amounts }));
  }, [hierarchy, drillCat, currentYear]);

  const barData = {
    labels: displayYears.map(y => `FY${y}`),
    datasets: trendGroups.map((g, i) => ({
      label: g.label,
      data: displayYears.map(y => g.amounts[y] || 0),
      backgroundColor: REV_COLORS[i % REV_COLORS.length] + "e0",
      borderWidth: 0,
      borderRadius: 3,
    })),
  };

  // Dynamic insights
  const insights = useMemo(() => {
    const out: string[] = [];
    const top = catTotals[0];
    if (top && totalRevenue > 0) {
      const pct = ((top.amount / totalRevenue) * 100).toFixed(0);
      out.push(`${top.label} is the primary revenue source, representing ${pct}% of FY${currentYear} total revenue.`);
    }
    if (pctChange !== null) {
      const dir = pctChange >= 0 ? "increased" : "decreased";
      out.push(`Total revenue has ${dir} by ${Math.abs(pctChange).toFixed(1)}% compared to the prior year.`);
    }
    if (catTotals[1] && totalRevenue > 0) {
      const pct = ((catTotals[1].amount / totalRevenue) * 100).toFixed(0);
      out.push(`${catTotals[1].label} provides ${pct}% of annual operating revenue.`);
    }
    return out.slice(0, 3);
  }, [catTotals, totalRevenue, currentYear, pctChange]);

  return (
    <div className="space-y-6">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-gray-200/60 bg-white shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          {/* Total */}
          <div className="px-7 py-6">
            <p
              className="text-[10px] font-bold uppercase tracking-widest mb-2"
              style={{ color: REV_COLORS[0] }}
            >
              FY{currentYear} Total Revenue
            </p>
            <p
              className="text-5xl font-bold tabular-nums text-gray-900 tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {abbreviateCurrency(totalRevenue)}
            </p>
            {pctChange !== null && (
              <div className="flex items-center gap-2 mt-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                    pctChange >= 0 ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
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

          {/* Top two sources */}
          <div className="px-7 py-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
              Top Revenue Sources
            </p>
            <div className="space-y-3">
              {catTotals.slice(0, 2).map(({ label, amount }, i) => (
                <div key={label}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <ColorSwatch color={REV_COLORS[i]} size={8} />
                    <p className="text-xs text-gray-500 font-medium">{label}</p>
                  </div>
                  <p
                    className="text-xl font-bold tabular-nums"
                    style={{ color: REV_COLORS[i], fontFamily: "var(--font-display)" }}
                  >
                    {abbreviateCurrency(amount)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(1) : 0}% of total
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Insight */}
          <div className="px-7 py-6 bg-gray-50/50">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
              Revenue Context
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

        {/* Proportion strip */}
        {catTotals.length > 0 && totalRevenue > 0 && (
          <div className="px-7 pb-5 pt-3 border-t border-gray-100">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 mb-2">
              Revenue Mix
            </p>
            <div
              className="flex h-3 rounded-full overflow-hidden gap-px"
              role="img"
              aria-label="Revenue proportions by source"
            >
              {catTotals.map(({ label, amount }, i) => (
                <div
                  key={label}
                  style={{
                    width: `${(amount / totalRevenue) * 100}%`,
                    backgroundColor: REV_COLORS[i % REV_COLORS.length],
                  }}
                  title={`${label}: ${abbreviateCurrency(amount)}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
              {catTotals.slice(0, 6).map(({ label, amount }, i) => (
                <span key={label} className="text-xs text-gray-500 flex items-center gap-1.5">
                  <ColorSwatch color={REV_COLORS[i % REV_COLORS.length]} size={8} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Where Revenue Comes From ──────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2
              className="text-lg font-bold text-gray-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Where Town Revenue Comes From
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              FY{currentYear} revenue by source
            </p>
          </div>
          {hasSubcategories && (
            <div
              className="flex gap-px rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
              role="group"
              aria-label="View mode"
            >
              {(["category", "subcategory"] as const).map(dim => (
                <button
                  key={dim}
                  onClick={() => setActivePieDim(dim)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                    activePieDim === dim ? "text-white" : "text-gray-500 hover:text-gray-700"
                  }`}
                  style={activePieDim === dim ? { backgroundColor: REV_COLORS[0] } : {}}
                  aria-pressed={activePieDim === dim}
                >
                  {dim === "category" ? "By Category" : "By Subcategory"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Ranked bars */}
          <div className="lg:col-span-3 bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm">
            <div className="space-y-2.5">
              {rankedItems.slice(0, 8).map((item, i) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-gray-300 w-4 text-right flex-shrink-0">
                        {i + 1}
                      </span>
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
                      style={{ width: `${item.pct}%`, backgroundColor: item.color, opacity: 0.85 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm h-full">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">
                Quick Stats
              </p>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Revenue sources</p>
                  <p
                    className="text-2xl font-bold text-gray-900"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {rankedItems.length}
                  </p>
                </div>
                {rankedItems[0] && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Largest source</p>
                    <p className="text-base font-bold text-gray-900 leading-tight">
                      {catTotals[0]?.label}
                    </p>
                    <p className="text-sm text-gray-500">
                      {catTotals[0] && totalRevenue > 0
                        ? ((catTotals[0].amount / totalRevenue) * 100).toFixed(1)
                        : 0}% · {catTotals[0] ? abbreviateCurrency(catTotals[0].amount) : ""}
                    </p>
                  </div>
                )}
                {years.length > 1 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Years of data</p>
                    <p className="text-base font-bold text-gray-900">{years.length} fiscal years</p>
                    <p className="text-sm text-gray-500">
                      FY{years[0]} – FY{years[years.length - 1]}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Multi-Year Trend ──────────────────────────────────── */}
      <div>
        <div className="mb-4">
          <h2
            className="text-lg font-bold text-gray-900"
            style={{ fontFamily: "var(--font-display)" }}
          >
            How Sutton&rsquo;s Revenue Mix Has Evolved
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Compare revenue sources across recent fiscal years
          </p>
        </div>
        <div className="bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm">
          {drillCat && (
            <button
              onClick={() => setDrillCat(null)}
              className="text-xs text-gray-400 hover:text-gray-700 mb-3 flex items-center gap-1 transition-colors"
            >
              ← All categories
            </button>
          )}
          {!drillCat && (
            <p className="text-xs text-gray-400 mb-3">
              Click a bar segment to drill into subcategories
            </p>
          )}
          <div className="h-64">
            <Bar
              data={barData}
              options={{
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                onClick: (_event: unknown, elements: { datasetIndex: number }[]) => {
                  if (elements.length > 0 && drillCat === null) {
                    const label = trendGroups[elements[0].datasetIndex]?.label;
                    if (label) setDrillCat(label);
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
        </div>
      </div>

      {/* ── Understanding Revenue explainer ──────────────────── */}
      <div className="rounded-xl border border-gray-200/60 bg-white/60 px-6 py-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
          Understanding Revenue
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              heading: "Taxes & Excise",
              body: "Includes property taxes and other local tax sources — typically the Town's largest single revenue category.",
            },
            {
              heading: "State Aid",
              body: "State government distributions, including Chapter 70 education aid and unrestricted local aid.",
            },
            {
              heading: "Local Receipts",
              body: "Fees, permits, licenses, fines, and other locally generated non-tax revenue.",
            },
            {
              heading: "Balanced Budget",
              body: "Massachusetts law requires the Town to adopt a balanced annual operating budget each fiscal year.",
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
  );
}
