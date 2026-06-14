"use client";

import { Pie, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement, CategoryScale, LinearScale, BarElement,
  Tooltip, Legend,
} from "chart.js";
import { abbreviateCurrency } from "@/lib/format";

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const COLORS = ["#4f46e5","#059669","#d97706","#dc2626","#7c3aed","#0891b2","#be185d","#2563eb","#65a30d","#ea580c"];

function sourceColor(s: string): string {
  const sl = s.toLowerCase();
  if (sl.includes("free cash")) return "#059669";
  if (sl.includes("borrow")) return "#4f46e5";
  if (sl.includes("stabiliz")) return "#d97706";
  if (sl.includes("grant")) return "#0891b2";
  return "#6b7280";
}

interface CapitalChartsProps {
  byDept: [string, number][];
  bySources: [string, number][];
  yearlyData: { year: string; depts: Record<string, number>; total: number }[];
  color: string;
}

export default function CapitalCharts({ byDept, bySources, yearlyData, color }: CapitalChartsProps) {
  const deptPie = {
    labels: byDept.map(([d]) => d),
    datasets: [{ data: byDept.map(([, v]) => v), backgroundColor: COLORS, borderWidth: 2, borderColor: "#fff" }],
  };

  const sourcePie = {
    labels: bySources.map(([s]) => s),
    datasets: [{ data: bySources.map(([, v]) => v), backgroundColor: bySources.map(([s]) => sourceColor(s)), borderWidth: 2, borderColor: "#fff" }],
  };

  // Stacked bar: x = years, datasets = departments
  const allDepts = [...new Set(yearlyData.flatMap(y => Object.keys(y.depts)))];
  const stackedBar = {
    labels: yearlyData.map(y => `FY${y.year}`),
    datasets: allDepts.map((dept, i) => ({
      label: dept,
      data: yearlyData.map(y => y.depts[dept] || 0),
      backgroundColor: COLORS[i % COLORS.length] + "dd",
      borderWidth: 0,
      borderRadius: 2,
    })),
  };

  const pieOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const, labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } },
      tooltip: { callbacks: { label: (ctx: { parsed: number; label: string }) => ` ${ctx.label}: ${abbreviateCurrency(ctx.parsed)}` } },
    },
  };

  const barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const, labels: { boxWidth: 10, font: { size: 10 }, padding: 6 } },
      tooltip: { callbacks: { label: (ctx: { parsed: { y: number }; dataset: { label: string } }) => ` ${ctx.dataset.label}: ${abbreviateCurrency(ctx.parsed.y)}` } },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { stacked: true, ticks: { font: { size: 10 }, callback: (v: number | string) => abbreviateCurrency(Number(v)) }, grid: { color: "#f3f4f6" } },
    },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-800 mb-3">By Department</p>
        <div className="h-56"><Pie data={deptPie} options={pieOpts} /></div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-800 mb-3">By Funding Source</p>
        <div className="h-56"><Pie data={sourcePie} options={pieOpts} /></div>
      </div>
      {yearlyData.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-800 mb-3">Year-over-Year by Department</p>
          <div className="h-56"><Bar data={stackedBar} options={barOpts as Parameters<typeof Bar>[0]["options"]} /></div>
        </div>
      )}
    </div>
  );
}
