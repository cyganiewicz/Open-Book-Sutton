"use client";

import { useState, useMemo } from "react";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend,
} from "chart.js";
import { abbreviateCurrency } from "@/lib/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const COLORS = [
  "#059669","#4f46e5","#d97706","#dc2626","#7c3aed",
  "#0891b2","#be185d","#2563eb","#65a30d","#ea580c",
  "#6366f1","#14b8a6","#f59e0b","#ef4444","#8b5cf6",
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

function collectLeaves(nodes: RevHierarchyNode[]): { id: string; label: string; amounts: Record<string, number> }[] {
  return nodes.flatMap(n => {
    if (n.isLeaf) return n.rows || [];
    return collectLeaves(n.children);
  });
}

export default function RevenueHeader({
  hierarchy, years, currentYear, townColor, totalRevenue, prevTotal,
}: RevenueHeaderProps) {
  const [drillCat, setDrillCat] = useState<string | null>(null);
  const [activePieDim, setActivePieDim] = useState<"category" | "subcategory">("category");

  const displayYears = years.slice(-5);
  const pctChange = prevTotal > 0 ? ((totalRevenue - prevTotal) / prevTotal * 100) : null;

  // Top-level category totals for proportion bar
  const catTotals = useMemo(() =>
    hierarchy.map(n => ({ label: n.key, amount: n.amounts[currentYear] || 0 }))
      .sort((a, b) => b.amount - a.amount),
    [hierarchy, currentYear]
  );

  // Trend groups
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
      backgroundColor: COLORS[i % COLORS.length] + "dd",
      borderWidth: 0,
      borderRadius: 2,
    })),
  };

  // Pie data
  const pieData = useMemo(() => {
    const nodes = activePieDim === "category"
      ? hierarchy.filter(n => n.key !== "_direct")
      : hierarchy.flatMap(n => n.children.filter(c => c.key !== "_direct"));
    return {
      labels: nodes.map(n => n.key),
      datasets: [{
        data: nodes.map(n => n.amounts[currentYear] || 0),
        backgroundColor: COLORS,
        borderWidth: 2,
        borderColor: "#fff",
      }],
    };
  }, [activePieDim, hierarchy, currentYear]);

  const hasSubcategories = hierarchy.some(n => n.children.filter(c => c.key !== "_direct").length > 0);

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <div className="rounded-2xl overflow-hidden shadow-md"
        style={{ background: `linear-gradient(135deg, ${townColor} 0%, ${townColor}dd 100%)` }}>
        <div className="px-6 pt-6 pb-4">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-2">
            FY{currentYear} Total Revenue
          </p>
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <p className="text-white text-5xl font-bold tracking-tight tabular-nums">
                {abbreviateCurrency(totalRevenue)}
              </p>
              {pctChange !== null && (
                <p className="text-sm mt-1.5 text-white/70 flex items-center gap-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                    pctChange >= 0 ? "bg-white/25 text-white" : "bg-red-400/40 text-white"
                  }`}>
                    {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                  </span>
                  vs prior year ({abbreviateCurrency(prevTotal)})
                </p>
              )}
            </div>
            {catTotals.slice(0, 2).map(({ label, amount }) => (
              <div key={label} className="border-l border-white/20 pl-8">
                <p className="text-white/50 text-xs uppercase tracking-wide font-medium">{label}</p>
                <p className="text-white text-2xl font-bold mt-0.5">{abbreviateCurrency(amount)}</p>
                <p className="text-white/50 text-xs mt-0.5">
                  {totalRevenue > 0 ? ((amount / totalRevenue) * 100).toFixed(1) : 0}% of revenue
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Category proportion bar */}
        {catTotals.length > 0 && totalRevenue > 0 && (
          <div className="px-6 pb-5">
            <div className="flex h-2.5 rounded-full overflow-hidden gap-px mt-1">
              {catTotals.map(({ label, amount }, i) => (
                <div key={label}
                  style={{ width: `${(amount / totalRevenue) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }}
                  title={`${label}: ${abbreviateCurrency(amount)}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5">
              {catTotals.slice(0, 6).map(({ label, amount }, i) => (
                <span key={label} className="text-white/60 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {label}: {abbreviateCurrency(amount)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800">FY{currentYear} Breakdown</p>
            {hasSubcategories && (
              <div className="flex gap-px border border-gray-200 rounded-lg overflow-hidden text-xs">
                {(["category", "subcategory"] as const).map(dim => (
                  <button key={dim}
                    onClick={() => setActivePieDim(dim)}
                    className={`px-2.5 py-1.5 transition-colors font-medium ${activePieDim === dim ? "text-white" : "text-gray-500 hover:bg-gray-50"}`}
                    style={activePieDim === dim ? { backgroundColor: townColor } : {}}>
                    {dim === "category" ? "By Category" : "By Subcategory"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="h-56">
            <Pie data={pieData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } },
                tooltip: { callbacks: { label: (ctx: { parsed: number; label: string }) =>
                  ` ${ctx.label}: ${abbreviateCurrency(ctx.parsed)}` } },
              },
            }} />
          </div>
        </div>

        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              {drillCat && (
                <button onClick={() => setDrillCat(null)}
                  className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-500 hover:bg-gray-50">
                  ← All categories
                </button>
              )}
              <p className="text-sm font-semibold text-gray-800">
                {drillCat ? `${drillCat} — Subcategories` : "Multi-Year Revenue Trend"}
              </p>
            </div>
          </div>
          {!drillCat && <p className="text-xs text-gray-400 mb-2">Click a bar to drill into subcategories</p>}
          <div className="h-56">
            <Bar data={barData} options={{
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
                legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } },
                tooltip: { callbacks: { label: (ctx: { parsed: { x: number }; dataset: { label: string } }) =>
                  ` ${ctx.dataset.label}: ${abbreviateCurrency(ctx.parsed.x)}` } },
              },
              scales: {
                x: {
                  stacked: true,
                  ticks: { font: { size: 10 }, callback: (v: number | string) => abbreviateCurrency(Number(v)) },
                  grid: { color: "#f3f4f6" },
                },
                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
              },
            } as Parameters<typeof Bar>[0]["options"]} />
          </div>
        </div>
      </div>
    </div>
  );
}
