"use client";

import { useState, useMemo } from "react";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend,
} from "chart.js";
import { abbreviateCurrency } from "@/lib/format";
import { type HierarchyNode, type SummaryTile, fallbackSpendingType } from "@/lib/expense-types";
import { resolveSpendingType, type AccountSegment, type AccountCodeConfig } from "@/lib/account-codes";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const COLORS = [
  "#4f46e5","#059669","#d97706","#dc2626","#7c3aed",
  "#0891b2","#be185d","#2563eb","#65a30d","#ea580c",
  "#6366f1","#14b8a6","#f59e0b","#ef4444","#8b5cf6",
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
}

function collectLeaves(nodes: HierarchyNode[]): { id: string; label: string; objectCode: string | null; amounts: Record<string, number> }[] {
  return nodes.flatMap(n => {
    if (n.key === "_direct" || n.isLeaf) return n.rows || [];
    return collectLeaves(n.children);
  });
}

function getSpendingType(
  objectCode: string | null,
  segments: AccountSegment[],
  spendingTypeSegIdx: number | null
): string | null {
  if (!objectCode) return null;
  if (spendingTypeSegIdx !== null) {
    const cfg = { segments, spendingTypeSegment: spendingTypeSegIdx, separator: "-" } as AccountCodeConfig;
    const resolved = resolveSpendingType(objectCode, cfg);
    if (resolved) return resolved;
  }
  return fallbackSpendingType(objectCode, "-");
}

// amounts keys are plain years ("2025") for the primary display value
function buildSpendingTypeTotals(
  leaves: ReturnType<typeof collectLeaves>,
  years: string[],
  segments: AccountSegment[],
  spendingTypeSegIdx: number | null
): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  for (const leaf of leaves) {
    const type = getSpendingType(leaf.objectCode, segments, spendingTypeSegIdx);
    if (!type) continue;
    if (!map.has(type)) map.set(type, Object.fromEntries(years.map(y => [y, 0])));
    const entry = map.get(type)!;
    for (const y of years) {
      entry[y] = (entry[y] || 0) + (leaf.amounts[y] || 0);
    }
  }
  return map;
}

export default function ExpenseHeader({
  tiles, hierarchy, years, currentYear, townColor,
  totalBudget, prevTotal,
  spendingTypeSegmentIndex, accountSegments,
}: ExpenseHeaderProps) {
  const [drillFn, setDrillFn] = useState<string | null>(null);
  const [activePieDim, setActivePieDim] = useState<"function" | "spendingType">("function");

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
  const totalForBar = [...spendingTypeTotals.values()].reduce((s, v) => s + (v[currentYear] || 0), 0);

  // Trend chart — use plain year amounts (primary display value)
  const trendGroups = useMemo(() => {
    if (drillFn === null) {
      return hierarchy
        .filter(n => n.key !== "_direct")
        .sort((a, b) => (b.amounts[currentYear] || 0) - (a.amounts[currentYear] || 0))
        .slice(0, 8)
        .map(n => ({ label: n.key, amounts: n.amounts }));
    } else {
      const fnNode = hierarchy.find(n => n.key === drillFn);
      if (!fnNode) return [];
      return fnNode.children
        .filter(n => n.key !== "_direct")
        .sort((a, b) => (b.amounts[currentYear] || 0) - (a.amounts[currentYear] || 0))
        .slice(0, 10)
        .map(n => ({ label: n.key, amounts: n.amounts }));
    }
  }, [hierarchy, drillFn, currentYear]);

  const barData = {
    labels: displayYears.map(y => `FY${y}`),
    datasets: trendGroups.map((g, i) => ({
      label: g.label,
      data: displayYears.map(y => g.amounts[y] || 0),
      backgroundColor: COLORS[i % COLORS.length] + "dd",
      borderColor: COLORS[i % COLORS.length],
      borderWidth: 0,
      borderRadius: 2,
    })),
  };

  const pieData = useMemo(() => {
    if (activePieDim === "function") {
      const fnNodes = hierarchy.filter(n => n.key !== "_direct");
      return {
        labels: fnNodes.map(n => n.key),
        datasets: [{
          data: fnNodes.map(n => n.amounts[currentYear] || 0),
          backgroundColor: COLORS,
          borderWidth: 2,
          borderColor: "#fff",
        }],
      };
    } else {
      return {
        labels: spendingTypeSorted.map(([type]) => type),
        datasets: [{
          data: spendingTypeSorted.map(([, v]) => v[currentYear] || 0),
          backgroundColor: COLORS,
          borderWidth: 2,
          borderColor: "#fff",
        }],
      };
    }
  }, [activePieDim, hierarchy, spendingTypeSorted, currentYear]);

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <div className="rounded-2xl overflow-hidden shadow-md"
        style={{ background: `linear-gradient(135deg, ${townColor} 0%, ${townColor}dd 100%)` }}>
        <div className="px-6 pt-6 pb-4">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-2">
            FY{currentYear} Operating Budget
          </p>
          <div className="flex flex-wrap items-end gap-8">
            <div>
              <p className="text-white text-5xl font-bold tracking-tight tabular-nums">
                {abbreviateCurrency(totalBudget)}
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
            {tiles.slice(1).map(t => (
              <div key={t.label} className="border-l border-white/20 pl-8">
                <p className="text-white/50 text-xs uppercase tracking-wide font-medium">{t.label}</p>
                <p className="text-white text-2xl font-bold mt-0.5">{t.value}</p>
                {t.sub && <p className="text-white/50 text-xs mt-0.5">{t.sub}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Spending type proportion bar */}
        {spendingTypeSorted.length > 0 && totalForBar > 0 && (
          <div className="px-6 pb-5">
            <div className="flex h-2.5 rounded-full overflow-hidden gap-px mt-1">
              {spendingTypeSorted.map(([type, yearAmts], i) => (
                <div key={type}
                  style={{ width: `${((yearAmts[currentYear] || 0) / totalForBar) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }}
                  title={`${type}: ${abbreviateCurrency(yearAmts[currentYear] || 0)}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5">
              {spendingTypeSorted.slice(0, 6).map(([type, yearAmts], i) => (
                <span key={type} className="text-white/60 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  {type}: {abbreviateCurrency(yearAmts[currentYear] || 0)}
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
            <div className="flex gap-px border border-gray-200 rounded-lg overflow-hidden text-xs">
              {(["function", "spendingType"] as const).map(dim => (
                <button key={dim}
                  onClick={() => setActivePieDim(dim)}
                  className={`px-2.5 py-1.5 transition-colors font-medium ${activePieDim === dim ? "text-white" : "text-gray-500 hover:bg-gray-50"}`}
                  style={activePieDim === dim ? { backgroundColor: townColor } : {}}>
                  {dim === "function" ? "By Function" : "By Type"}
                </button>
              ))}
            </div>
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
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              {drillFn && (
                <button onClick={() => setDrillFn(null)}
                  className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-500 hover:bg-gray-50 flex items-center gap-1">
                  ← All functions
                </button>
              )}
              <p className="text-sm font-semibold text-gray-800">
                {drillFn ? `${drillFn} — Departments` : "Multi-Year Trend by Function"}
              </p>
            </div>
          </div>
          {!drillFn && <p className="text-xs text-gray-400 mb-2">Click a function bar to see its departments</p>}
          <div className="h-56">
            <Bar data={barData} options={{
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              onClick: (_event: unknown, elements: { datasetIndex: number }[]) => {
                if (elements.length > 0 && drillFn === null) {
                  const fnLabel = trendGroups[elements[0].datasetIndex]?.label;
                  if (fnLabel) setDrillFn(fnLabel);
                }
              },
              plugins: {
                legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } },
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
