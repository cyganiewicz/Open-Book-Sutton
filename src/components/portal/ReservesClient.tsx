"use client";

import { useState, useEffect, useRef } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Tooltip, Legend,
} from "chart.js";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const FUND_COLORS = [
  "#2d6a4f",
  "#1e6091",
  "#d97706",
  "#0891b2",
  "#4a7c59",
  "#7c3aed",
  "#52796f",
  "#be185d",
  "#40916c",
  "#84a98c",
];

interface Fund {
  name: string;
  category: string;
  balances: Record<string, number>;
}

interface ReservesClientProps {
  funds: Fund[];
  allYears: string[];
  latestYear: string;
  color: string;
  totalLatest: number;
  categories: [string, number][];
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

export default function ReservesClient({
  funds,
  allYears,
  latestYear,
  color,
  totalLatest,
  categories,
}: ReservesClientProps) {
  const [expandedFund, setExpandedFund] = useState<string | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Scroll table to the right on mount so the most recent year is visible
  useEffect(() => {
    const el = tableScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // ── Trend chart: stacked bars, x-axis = fiscal years ────────
  const trendChartData = {
    labels: allYears.map(y => `FY${y}`),
    datasets: funds.slice(0, 8).map((fund, i) => ({
      label: fund.name,
      data: allYears.map(y => fund.balances[y] || 0),
      backgroundColor: FUND_COLORS[i % FUND_COLORS.length] + "d0",
      borderWidth: 0,
      borderRadius: 2,
    })),
  };

  const trendOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          font: { size: 10 },
          padding: 10,
          usePointStyle: true,
          pointStyle: "rectRounded" as const,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { y: number }; dataset: { label: string } }) =>
            ` ${ctx.dataset.label}: ${abbreviateCurrency(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#9ca3af" },
        border: { color: "#f3f4f6" },
      },
      y: {
        stacked: true,
        ticks: {
          font: { size: 11 },
          callback: (v: number | string) => abbreviateCurrency(Number(v)),
          color: "#9ca3af",
        },
        grid: { color: "#f3f4f6" },
        border: { color: "#f3f4f6" },
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* ── Chart section ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Trend chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm">
          <div className="mb-4">
            <h2
              className="text-base font-bold text-gray-900"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Reserve Balance Trend
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Total fund balances by fiscal year
            </p>
          </div>
          <div className="h-72">
            <Bar
              data={trendChartData}
              options={trendOpts as Parameters<typeof Bar>[0]["options"]}
            />
          </div>
        </div>

        {/* Category breakdown */}
        <div className="bg-white border border-gray-200/60 rounded-xl p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
            By Category — FY{latestYear}
          </p>
          <div className="space-y-3">
            {categories.map(([cat, amt], i) => {
              const pct = totalLatest > 0 ? (amt / totalLatest) * 100 : 0;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <ColorSwatch color={FUND_COLORS[i % FUND_COLORS.length]} size={8} />
                      <span className="text-sm text-gray-700 font-medium truncate">{cat}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
                      <span className="text-sm font-bold tabular-nums text-gray-900 w-16 text-right">
                        {abbreviateCurrency(amt)}
                      </span>
                    </div>
                  </div>
                  <div className="ml-5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: FUND_COLORS[i % FUND_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 font-medium">Total Reserves</span>
              <span className="font-bold text-gray-900 tabular-nums">
                {abbreviateCurrency(totalLatest)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fund detail table ────────────────────────────────── */}
      <div className="bg-white border border-gray-200/60 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2
            className="text-base font-bold text-gray-900"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Reserve Fund Detail
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Historical balances by fund — most recent year shown at right
          </p>
        </div>

        <div className="overflow-x-auto" ref={tableScrollRef}>
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th
                  className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 sticky left-0 bg-gray-50/95 z-20"
                  style={{ minWidth: "160px" }}
                >
                  Fund Name
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">
                  Category
                </th>
                {allYears.map(year => (
                  <th
                    key={year}
                    className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                    style={{
                      color: year === latestYear ? color : "#9ca3af",
                      minWidth: "120px",
                    }}
                  >
                    FY{year}
                    {year === latestYear && (
                      <span className="ml-1 text-[8px] align-middle opacity-60">★</span>
                    )}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">
                  Change
                </th>
              </tr>
            </thead>
            <tbody>
              {funds.map((fund, i) => {
                const latest = fund.balances[latestYear] || 0;
                const prevYear = allYears.length > 1 ? allYears[allYears.length - 2] : null;
                const prev = prevYear ? (fund.balances[prevYear] || 0) : null;
                const change = prev !== null ? latest - prev : null;
                const changePct = prev && prev > 0 ? ((latest - prev) / prev) * 100 : null;
                const isExpanded = expandedFund === fund.name;

                return (
                  <tr
                    key={fund.name}
                    className={`border-t border-gray-100 transition-colors cursor-pointer ${
                      isExpanded ? "bg-gray-50/60" : "hover:bg-gray-50/40"
                    }`}
                    onClick={() => setExpandedFund(isExpanded ? null : fund.name)}
                  >
                    <td
                      className="px-5 py-3 sticky left-0 z-10 bg-inherit"
                      style={{ backgroundColor: isExpanded ? "rgb(249 250 251 / 0.6)" : "white" }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: FUND_COLORS[i % FUND_COLORS.length] }}
                          aria-hidden
                        />
                        <span className="font-semibold text-gray-800 text-sm leading-tight">
                          {fund.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                        {fund.category}
                      </span>
                    </td>
                    {allYears.map(year => (
                      <td
                        key={year}
                        className="px-4 py-3 text-right tabular-nums whitespace-nowrap"
                        style={{
                          color: year === latestYear ? "#111827" : "#6b7280",
                          fontWeight: year === latestYear ? 700 : 400,
                          fontSize: "0.875rem",
                        }}
                      >
                        {fund.balances[year] ? formatCurrency(fund.balances[year]) : "—"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {change !== null && changePct !== null ? (
                        <span
                          className={`text-xs font-bold ${
                            change >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          {change >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Grand total row */}
              <tr className="border-t-2 border-gray-200 bg-gray-50/70">
                <td
                  className="px-5 py-3 sticky left-0 bg-gray-50/95 z-10"
                  colSpan={2}
                >
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    Total Reserves
                  </span>
                </td>
                {allYears.map(year => {
                  const yearTotal = funds.reduce((s, f) => s + (f.balances[year] || 0), 0);
                  return (
                    <td
                      key={year}
                      className="px-4 py-3 text-right tabular-nums whitespace-nowrap font-bold text-sm"
                      style={{ color: year === latestYear ? color : "#6b7280" }}
                    >
                      {formatCurrency(yearTotal)}
                    </td>
                  );
                })}
                <td className="px-4 py-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
