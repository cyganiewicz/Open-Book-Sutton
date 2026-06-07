"use client";

import { useState, useMemo } from "react";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  ArcElement, Tooltip, Legend, type ChartData,
} from "chart.js";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import { type HierarchyNode, OBJECT_SPENDING_MAP } from "@/lib/expense-types";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const COLORS = [
  "#4f46e5","#059669","#d97706","#dc2626","#7c3aed",
  "#0891b2","#be185d","#2563eb","#65a30d","#ea580c",
  "#6366f1","#14b8a6","#f59e0b","#ef4444","#8b5cf6",
];

import { type SummaryTile } from "@/lib/expense-types";

interface ExpenseHeaderProps {
  tiles: SummaryTile[];
  hierarchy: HierarchyNode[];
  years: string[];
  currentYear: string;
  townColor: string;
  totalBudget: number;
  prevTotal: number;
}

// Collect all leaf rows from a hierarchy node
function collectLeaves(nodes: HierarchyNode[]): { label: string; objectCode: string | null; amounts: Record<string, number> }[] {
  return nodes.flatMap(n => {
    if (n.key === "_direct" || n.isLeaf) return n.rows || [];
    return collectLeaves(n.children);
  });
}

// Get all nodes at a given depth level
function getLevel(nodes: HierarchyNode[], depth: number): HierarchyNode[] {
  if (depth === 0) return nodes.filter(n => n.key !== "_direct");
  return nodes.flatMap(n => n.key !== "_direct" ? getLevel(n.children, depth - 1) : []);
}

type DrillDimension = "function" | "department" | "location" | "spendingType";

const DRILL_OPTIONS: { key: DrillDimension; label: string }[] = [
  { key: "function", label: "Function Area" },
  { key: "department", label: "Department" },
  { key: "location", label: "Location" },
  { key: "spendingType", label: "Spending Type" },
];

export default function ExpenseHeader({
  tiles, hierarchy, years, currentYear, townColor, totalBudget, prevTotal,
}: ExpenseHeaderProps) {
  const [drillDim, setDrillDim] = useState<DrillDimension>("function");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [activePieDim, setActivePieDim] = useState<"function" | "spendingType">("function");

  // Build trend chart data based on drill dimension
  const trendData = useMemo(() => {
    let groups: { label: string; nodeOrRows: HierarchyNode | null; amounts: Record<string, number> }[] = [];

    if (drillDim === "function") {
      const fnNodes = getLevel(hierarchy, 0);
      groups = fnNodes.slice(0, 8).map(n => ({ label: n.key, nodeOrRows: n, amounts: n.amounts }));
    } else if (drillDim === "department") {
      const depts = getLevel(hierarchy, 1);
      const deptMap = new Map<string, Record<string, number>>();
      for (const d of depts) {
        const existing = deptMap.get(d.key) || {};
        for (const y of years) existing[y] = (existing[y] || 0) + (d.amounts[y] || 0);
        deptMap.set(d.key, existing);
      }
      groups = [...deptMap.entries()]
        .sort((a, b) => (b[1][currentYear] || 0) - (a[1][currentYear] || 0))
        .slice(0, 8)
        .map(([label, amounts]) => ({ label, nodeOrRows: null, amounts }));
    } else if (drillDim === "location") {
      const locs = getLevel(hierarchy, 2);
      const locMap = new Map<string, Record<string, number>>();
      for (const l of locs) {
        if (l.key === "_direct") continue;
        const existing = locMap.get(l.key) || {};
        for (const y of years) existing[y] = (existing[y] || 0) + (l.amounts[y] || 0);
        locMap.set(l.key, existing);
      }
      groups = [...locMap.entries()]
        .sort((a, b) => (b[1][currentYear] || 0) - (a[1][currentYear] || 0))
        .slice(0, 8)
        .map(([label, amounts]) => ({ label, nodeOrRows: null, amounts }));
    } else {
      // Spending type from object codes
      const leaves = collectLeaves(hierarchy);
      const typeMap = new Map<string, Record<string, number>>();
      for (const leaf of leaves) {
        const prefix = (leaf.objectCode || "").slice(0, 2);
        const type = OBJECT_SPENDING_MAP[prefix] || "Other";
        const existing = typeMap.get(type) || {};
        for (const y of years) existing[y] = (existing[y] || 0) + (leaf.amounts[y] || 0);
        typeMap.set(type, existing);
      }
      groups = [...typeMap.entries()]
        .sort((a, b) => (b[1][currentYear] || 0) - (a[1][currentYear] || 0))
        .slice(0, 8)
        .map(([label, amounts]) => ({ label, nodeOrRows: null, amounts }));
    }

    return groups;
  }, [drillDim, hierarchy, years, currentYear]);

  // Filter by selected node when drilling in
  const filteredTrendData = useMemo(() => {
    if (!selectedNode) return trendData;
    return trendData.filter(g => g.label === selectedNode);
  }, [trendData, selectedNode]);

  const displayYears = years.slice(-5); // show up to 5 years on trend

  const barData: ChartData<"bar"> = {
    labels: displayYears.map(y => `FY${y}`),
    datasets: filteredTrendData.map((g, i) => ({
      label: g.label,
      data: displayYears.map(y => g.amounts[y] || 0),
      backgroundColor: COLORS[i % COLORS.length] + "cc",
      borderRadius: 3,
    })),
  };

  // Pie data by function or spending type
  const pieData = useMemo(() => {
    if (activePieDim === "function") {
      const fnNodes = getLevel(hierarchy, 0).filter(n => n.key !== "_direct");
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
      const leaves = collectLeaves(hierarchy);
      const typeMap = new Map<string, number>();
      for (const leaf of leaves) {
        const prefix = (leaf.objectCode || "").slice(0, 2);
        const type = OBJECT_SPENDING_MAP[prefix] || "Other";
        typeMap.set(type, (typeMap.get(type) || 0) + (leaf.amounts[currentYear] || 0));
      }
      const sorted = [...typeMap.entries()].sort((a,b) => b[1]-a[1]);
      return {
        labels: sorted.map(([t]) => t),
        datasets: [{
          data: sorted.map(([,v]) => v),
          backgroundColor: COLORS,
          borderWidth: 2,
          borderColor: "#fff",
        }],
      };
    }
  }, [activePieDim, hierarchy, currentYear]);

  const pctChange = prevTotal > 0 ? ((totalBudget - prevTotal) / prevTotal * 100) : null;

  return (
    <div className="space-y-5">
      {/* ── Hero stat bar ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${townColor} 0%, ${townColor}cc 100%)` }}>
        <div className="px-6 pt-6 pb-4">
          <p className="text-white/70 text-sm font-medium uppercase tracking-widest mb-1">FY{currentYear} Operating Budget</p>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-white text-5xl font-bold tracking-tight tabular-nums">
                {abbreviateCurrency(totalBudget)}
              </p>
              {pctChange !== null && (
                <p className={`text-sm mt-1 font-medium ${pctChange >= 0 ? "text-white/70" : "text-white/70"}`}>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs mr-2 ${pctChange >= 0 ? "bg-white/20 text-white" : "bg-white/20 text-white"}`}>
                    {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                  </span>
                  vs prior year ({abbreviateCurrency(prevTotal)})
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-6 pb-1">
              {tiles.slice(1).map(t => (
                <div key={t.label}>
                  <p className="text-white/60 text-xs uppercase tracking-wide">{t.label}</p>
                  <p className="text-white text-xl font-semibold tabular-nums">{t.value}</p>
                  {t.sub && <p className="text-white/50 text-xs">{t.sub}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mini spending type bar */}
        {(() => {
          const leaves = collectLeaves(hierarchy);
          const typeMap = new Map<string, number>();
          for (const leaf of leaves) {
            const prefix = (leaf.objectCode || "").slice(0, 2);
            const type = OBJECT_SPENDING_MAP[prefix] || "Other";
            typeMap.set(type, (typeMap.get(type) || 0) + (leaf.amounts[currentYear] || 0));
          }
          const total = [...typeMap.values()].reduce((s, v) => s + v, 0);
          const sorted = [...typeMap.entries()].sort((a, b) => b[1] - a[1]);
          return total > 0 ? (
            <div className="px-6 pb-5">
              <div className="flex h-2 rounded-full overflow-hidden gap-px">
                {sorted.map(([type, amt], i) => (
                  <div key={type} style={{ width: `${(amt/total)*100}%`, backgroundColor: COLORS[i % COLORS.length] }}
                    title={`${type}: ${abbreviateCurrency(amt)}`} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {sorted.slice(0, 6).map(([type, amt], i) => (
                  <span key={type} className="text-white/60 text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {type}: {abbreviateCurrency(amt)}
                  </span>
                ))}
              </div>
            </div>
          ) : null;
        })()}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Pie chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800">FY{currentYear} Breakdown</p>
            <div className="flex gap-1 border border-gray-200 rounded-lg overflow-hidden text-xs">
              <button onClick={() => setActivePieDim("function")}
                className={`px-2.5 py-1 transition-colors ${activePieDim === "function" ? "text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}
                style={activePieDim === "function" ? { backgroundColor: townColor } : {}}>
                By Function
              </button>
              <button onClick={() => setActivePieDim("spendingType")}
                className={`px-2.5 py-1 transition-colors ${activePieDim === "spendingType" ? "text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}
                style={activePieDim === "spendingType" ? { backgroundColor: townColor } : {}}>
                By Type
              </button>
            </div>
          </div>
          <div className="h-52">
            <Pie data={pieData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } },
                tooltip: { callbacks: { label: (ctx: { parsed: number }) => ` ${abbreviateCurrency(ctx.parsed)}` } },
              },
            }} />
          </div>
        </div>

        {/* Trend chart with drill-down */}
        <div className="lg:col-span-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-sm font-semibold text-gray-800">Multi-Year Trend</p>
            <div className="flex flex-wrap gap-2 items-center">
              {selectedNode && (
                <button onClick={() => setSelectedNode(null)}
                  className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1">
                  ← All
                </button>
              )}
              <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
                {DRILL_OPTIONS.map(opt => (
                  <button key={opt.key}
                    onClick={() => { setDrillDim(opt.key); setSelectedNode(null); }}
                    className={`px-2.5 py-1 transition-colors ${drillDim === opt.key ? "text-white font-medium" : "text-gray-500 hover:bg-gray-50"}`}
                    style={drillDim === opt.key ? { backgroundColor: townColor } : {}}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {selectedNode && (
            <p className="text-xs text-gray-500 mb-2">Showing: <strong>{selectedNode}</strong></p>
          )}
          <div className="h-52">
            <Bar data={barData} options={{
              responsive: true, maintainAspectRatio: false,
              onClick: (_event: unknown, elements: { datasetIndex: number }[]) => {
                if (elements.length > 0) {
                  const label = filteredTrendData[elements[0].datasetIndex]?.label;
                  if (label) setSelectedNode(prev => prev === label ? null : label);
                }
              },
              plugins: {
                legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } },
                tooltip: { callbacks: { label: (ctx: { parsed: { y: number } }) => ` ${abbreviateCurrency(ctx.parsed.y)}` } },
              },
              scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { stacked: true, ticks: { font: { size: 10 }, callback: (v: number | string) => abbreviateCurrency(Number(v)) }, grid: { color: "#f3f4f6" } },
              },
              cursor: "pointer",
            } as any} />
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">Click a bar segment to drill in</p>
        </div>
      </div>
    </div>
  );
}
