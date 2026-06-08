"use client";

import { useState } from "react";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import type { RevHierarchyNode } from "./RevenueHeader";

interface RevenueTableProps {
  hierarchy: RevHierarchyNode[];
  years: string[];
  currentYear: string;
  townColor: string;
  totalRevenue: number;
  levelNames: string[];
}

function tint(hex: string, opacity: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

const INDENT_REM = [1.25, 2.75, 4.25, 5.75];
const getIndent = (depth: number) => `${INDENT_REM[Math.min(depth, INDENT_REM.length - 1)]}rem`;

function NodeRow({
  node, depth, displayYears, currentYear, townColor, colCount, forceCollapsed, totalRevenue,
}: {
  node: RevHierarchyNode;
  depth: number;
  displayYears: string[];
  currentYear: string;
  townColor: string;
  colCount: number;
  forceCollapsed: boolean;
  totalRevenue: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const effectiveCollapsed = forceCollapsed || collapsed;
  const isTopLevel = depth === 0;
  const pct = totalRevenue > 0 ? ((node.amounts[currentYear] || 0) / totalRevenue * 100).toFixed(1) : "0";

  return (
    <>
      {isTopLevel ? (
        <tr
          className="cursor-pointer hover:opacity-95 transition-opacity border-t border-gray-100"
          style={{ backgroundColor: townColor }}
          onClick={() => setCollapsed(c => !c)}
        >
          <td className="px-5 py-3">
            <span className="inline-flex items-center gap-2">
              <span className="text-white/60 text-xs flex-shrink-0 transition-transform duration-150"
                style={{ display: "inline-block", transform: effectiveCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
              <span className="text-white font-semibold text-sm">{node.key}</span>
            </span>
          </td>
          {displayYears.map(y => (
            <td key={y} className="px-3 py-3 text-right tabular-nums whitespace-nowrap"
              style={{
                color: y === currentYear ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)",
                fontWeight: y === currentYear ? "600" : "400",
                fontSize: y === currentYear ? "0.9rem" : "0.8rem",
              }}>
              {formatCurrency(node.amounts[y] || 0)}
            </td>
          ))}
          <td className="px-3 py-3 text-right text-white/60 text-xs whitespace-nowrap">{pct}%</td>
        </tr>
      ) : (
        <tr
          className="border-t border-gray-100 cursor-pointer hover:opacity-95 transition-opacity"
          style={{ backgroundColor: depth === 1 ? tint(townColor, 0.07) : tint(townColor, 0.03) }}
          onClick={() => setCollapsed(c => !c)}
        >
          <td className="py-2.5 pr-3" style={{ paddingLeft: getIndent(depth) }}>
            <span className="inline-flex items-center gap-2">
              <span className="text-gray-400 text-xs flex-shrink-0 transition-transform duration-150"
                style={{ display: "inline-block", transform: effectiveCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
              <span className={`${depth === 1 ? "font-semibold text-gray-800" : "font-medium text-gray-700"} text-sm`}>
                {node.key}
              </span>
            </span>
          </td>
          {displayYears.map(y => (
            <td key={y} className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-700 text-sm whitespace-nowrap">
              {formatCurrency(node.amounts[y] || 0)}
            </td>
          ))}
          <td className="px-3 py-2.5 text-right text-gray-400 text-xs whitespace-nowrap">{pct}%</td>
        </tr>
      )}

      {/* Children */}
      {!effectiveCollapsed && !node.isLeaf && node.children.map(child => (
        <NodeRow key={child.key} node={child} depth={depth + 1}
          displayYears={displayYears} currentYear={currentYear}
          townColor={townColor} colCount={colCount}
          forceCollapsed={false} totalRevenue={totalRevenue} />
      ))}

      {/* Leaf rows */}
      {!effectiveCollapsed && node.isLeaf && node.rows?.map(row => (
        <tr key={row.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
          <td className="py-2 pr-3 text-gray-600 text-sm" style={{ paddingLeft: getIndent(depth + 1) }}>
            {row.label}
          </td>
          {displayYears.map(y => (
            <td key={y} className={`px-3 py-2 text-right tabular-nums text-sm whitespace-nowrap ${
              (row.amounts[y] || 0) === 0 ? "text-gray-300" : "text-gray-700"
            }`}>
              {(row.amounts[y] || 0) === 0 ? "—" : formatCurrency(row.amounts[y])}
            </td>
          ))}
          <td className="px-3 py-2 text-right text-gray-300 text-xs">—</td>
        </tr>
      ))}
    </>
  );
}

export default function RevenueTable({
  hierarchy, years, currentYear, townColor, totalRevenue, levelNames,
}: RevenueTableProps) {
  const MAX_VISIBLE_YEARS = 3;
  const [yearOffset, setYearOffset] = useState(Math.max(0, years.length - MAX_VISIBLE_YEARS));
  const [query, setQuery] = useState("");
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [hiddenYears, setHiddenYears] = useState<Set<string>>(new Set());
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const displayYears = years
    .slice(yearOffset, yearOffset + MAX_VISIBLE_YEARS)
    .filter(y => !hiddenYears.has(y));
  const colCount = 1 + displayYears.length + 1;
  const canScrollLeft = yearOffset > 0;
  const canScrollRight = yearOffset + MAX_VISIBLE_YEARS < years.length;

  const grandTotals: Record<string, number> = {};
  for (const y of displayYears) {
    grandTotals[y] = hierarchy.reduce((s, n) => s + (n.amounts[y] || 0), 0);
  }

  const q = query.toLowerCase().trim();

  const filterNodes = (nodes: RevHierarchyNode[], q: string): RevHierarchyNode[] => {
    if (!q) return nodes;
    return nodes.flatMap(n => {
      if (n.key.toLowerCase().includes(q)) return [n];
      if (n.isLeaf) {
        const rows = n.rows?.filter(r => r.label.toLowerCase().includes(q)) ?? [];
        return rows.length > 0 ? [{ ...n, rows }] : [];
      }
      const children = filterNodes(n.children, q);
      return children.length > 0 ? [{ ...n, children }] : [];
    });
  };

  const displayed = filterNodes(hierarchy, q);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50/60">
        <input
          type="text"
          placeholder="Search revenue sources…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex items-center gap-1 border border-gray-200 rounded-lg bg-white overflow-hidden">
          <button onClick={() => setYearOffset(o => Math.max(0, o - 1))} disabled={!canScrollLeft}
            className="px-2.5 py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-gray-200">◀</button>
          <span className="px-3 py-2 text-xs text-gray-600 font-medium whitespace-nowrap">
            {years.length > 1
              ? `FY${years[yearOffset]} – FY${years[Math.min(yearOffset + MAX_VISIBLE_YEARS - 1, years.length - 1)]}`
              : `FY${years[0] ?? ""}`}
          </span>
          <button onClick={() => setYearOffset(o => Math.min(years.length - MAX_VISIBLE_YEARS, o + 1))} disabled={!canScrollRight}
            className="px-2.5 py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-gray-200">▶</button>
        </div>

        <div className="relative">
          <button onClick={() => setFilterMenuOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
            <span className="text-gray-600">Columns</span>
            {hiddenYears.size > 0 && <span className="text-[10px] bg-blue-100 text-blue-600 rounded px-1">{hiddenYears.size} hidden</span>}
          </button>
          {filterMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[10rem]">
              <p className="px-3 pb-1 text-xs text-gray-400 font-medium uppercase tracking-wide">Show/hide years</p>
              {years.slice(yearOffset, yearOffset + MAX_VISIBLE_YEARS).map(y => (
                <label key={y} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={!hiddenYears.has(y)}
                    onChange={() => setHiddenYears(prev => {
                      const next = new Set(prev);
                      next.has(y) ? next.delete(y) : next.add(y);
                      return next;
                    })}
                    className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-gray-700">FY{y}</span>
                </label>
              ))}
              {hiddenYears.size > 0 && (
                <button onClick={() => setHiddenYears(new Set())}
                  className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-gray-50 border-t border-gray-100 mt-1">
                  Show all
                </button>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setAllCollapsed(c => !c)}
          className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 whitespace-nowrap">
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      {levelNames.length > 0 && (
        <div className="px-5 py-2 border-b border-gray-50 bg-gray-50/30 text-xs text-gray-400">
          Organized by: {levelNames.join(" → ")}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "480px" }}>
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
              {displayYears.map(y => (
                <th key={y} className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                  style={{ minWidth: "130px", color: y === currentYear ? townColor : "#9ca3af" }}>
                  FY{y}{y === currentYear && <span className="ml-1 normal-case font-normal opacity-60 text-[10px]">Budget</span>}
                </th>
              ))}
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400 w-16">%</th>
            </tr>
          </thead>
          <tbody key={`${allCollapsed}-${yearOffset}`}>
            {displayed.map((node, i) => (
              <NodeRow key={node.key + i} node={node} depth={0}
                displayYears={displayYears} currentYear={currentYear}
                townColor={townColor} colCount={colCount}
                forceCollapsed={allCollapsed} totalRevenue={totalRevenue} />
            ))}
            <tr className="border-t-2 border-gray-300 bg-gray-50/80">
              <td className="px-5 py-3 font-bold text-gray-900 text-sm">Total Revenue</td>
              {displayYears.map(y => (
                <td key={y} className="px-3 py-3 text-right tabular-nums font-bold text-gray-900 text-sm whitespace-nowrap">
                  {formatCurrency(grandTotals[y] || 0)}
                </td>
              ))}
              <td className="px-3 py-3 text-right font-bold text-gray-900 text-sm">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
