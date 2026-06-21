"use client";

import { useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Tooltip, Legend,
} from "chart.js";
import { abbreviateCurrency } from "@/lib/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const DEPT_COLORS = [
  "#2d6a4f","#4a7c59","#52796f","#1b4332","#74c69d",
  "#40916c","#84a98c","#b7c9b0","#1e6091","#2e86ab",
];

function sourceColor(s: string): string {
  const sl = s.toLowerCase();
  if (sl.includes("free cash")) return "#40916c";
  if (sl.includes("borrow")) return "#1e6091";
  if (sl.includes("stabiliz")) return "#d97706";
  if (sl.includes("grant")) return "#0891b2";
  return "#6b7280";
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

interface CapitalChartsProps {
  byDept: [string, number][];
  bySources: [string, number][];
  yearlyData: { year: string; depts: Record<string, number>; total: number }[];
  color: string;
  latestYear: string;
}

export default function CapitalCharts({ byDept, bySources, yearlyData, color, latestYear }: CapitalChartsProps) {
  const [pieDim, setPieDim] = useState<"dept" | "source">("dept");

  const total = pieDim === "dept"
    ? byDept.reduce((s, [, v]) => s + v, 0)
    : bySources.reduce((s, [, v]) => s + v, 0);

  const rankedItems = pieDim === "dept"
    ? byDept.map(([label, amount], i) => ({
        label,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
        color: DEPT_COLORS[i % DEPT_COLORS.length],
      }))
    : bySources.map(([label, amount]) => ({
        label,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
        color: sourceColor(label),
      }));

  // Horizontal stacked bar: y = fiscal years, datasets = departments
  const allDepts = [...new Set(yearlyData.flatMap(y => Object.keys(y.depts)))];
  const stackedBarData = {
    labels: yearlyData.map(y => `FY${y.year}`),
    datasets: allDepts.map((dept, i) => ({
      label: dept,
      data: yearlyData.map(y => y.depts[dept] || 0),
      backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] + "e0",
      borderWidth: 0,
      borderRadius: 2,
    })),
  };

  const barOpts = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          font: { size: 10 },
          padding: 8,
          usePointStyle: true,
          pointStyle: "rectRounded" as const,
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
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Ranked horizontal bars — replaces pie chart */}
      <div className="bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2
              className="text-base font-bold text-gray-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              What Sutton Is Investing In
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">FY{latestYear} · click toggle to switch view</p>
          </div>
          <div
            className="flex gap-px rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
            role="group"
            aria-label="View mode"
          >
            {(["dept", "source"] as const).map(dim => (
              <button
                key={dim}
                onClick={() => setPieDim(dim)}
                className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                  pieDim === dim
                    ? "text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
                style={pieDim === dim ? { backgroundColor: color } : {}}
                aria-pressed={pieDim === dim}
              >
                {dim === "dept" ? "Department" : "Funding"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {rankedItems.slice(0, 9).map((item, i) => (
            <div key={item.label} className="group">
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

      {/* Year-over-year horizontal stacked bar */}
      {yearlyData.length >= 1 && (
        <div className="bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h2
              className="text-base font-bold text-gray-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Four-Year Capital Investment Plan
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Planned investment by department across fiscal years
            </p>
          </div>
          <div className="h-64">
            <Bar
              data={stackedBarData}
              options={barOpts as Parameters<typeof Bar>[0]["options"]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
