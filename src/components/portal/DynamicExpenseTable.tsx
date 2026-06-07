"use client";

import { useState } from "react";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import type { HierarchyNode } from "@/app/[townSlug]/expenses/page";

interface DynamicExpenseTableProps {
  hierarchy: HierarchyNode[];
  levelNames: string[];
  years: string[];
  currentYear: string;
  townColor?: string;
  lineItemTooltips?: Record<string, string>;
}

function tint(hex: string, opacity: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

// Depth → visual style
const DEPTH_STYLES = [
  // Level 0: full color header button
  (color: string) => ({ bg: color, text: "text-white font-semibold text-sm", indent: "pl-5" }),
  // Level 1: tinted row, clickable
  (color: string) => ({ bg: tint(color, 0.08), text: "text-gray-800 font-semibold text-sm", indent: "pl-10" }),
  // Level 2: lighter tint
  (color: string) => ({ bg: tint(color, 0.04), text: "text-gray-700 font-medium text-sm", indent: "pl-16" }),
  // Level 3+: very subtle
  (color: string) => ({ bg: "transparent", text: "text-gray-600 font-medium text-xs", indent: "pl-20" }),
];

function getStyle(depth: number, color: string) {
  const fn = DEPTH_STYLES[Math.min(depth, DEPTH_STYLES.length - 1)];
  return fn(color);
}

// Recursive node renderer
function NodeRow({
  node,
  depth,
  levelNames,
  displayYears,
  currentYear,
  townColor,
  lineItemTooltips,
  colSpan,
}: {
  node: HierarchyNode;
  depth: number;
  levelNames: string[];
  displayYears: string[];
  currentYear: string;
  townColor: string;
  lineItemTooltips: Record<string, string>;
  colSpan: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const style = getStyle(depth, townColor);
  const isTopLevel = depth === 0;

  const headerContent = (
    <span className="inline-flex items-center gap-2 flex-1 min-w-0">
      <span
        className="text-xs flex-shrink-0 transition-transform duration-150 opacity-60"
        style={{ display: "inline-block", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
      >▾</span>
      <span className="truncate">{node.key}</span>
    </span>
  );

  const amountCells = displayYears.map(y => (
    <td key={y} className={`px-4 py-2.5 text-right tabular-nums whitespace-nowrap ${isTopLevel ? "text-white/90 font-medium" : "text-gray-700 font-semibold"}`}>
      {formatCurrency(node.amounts[y] || 0)}
    </td>
  ));

  return (
    <>
      {/* Group header row */}
      {isTopLevel ? (
        <tr>
          <td colSpan={colSpan} className="p-0 border-t border-gray-100">
            <button
              onClick={() => setCollapsed(c => !c)}
              className="w-full flex items-center gap-0 text-left hover:opacity-95 transition-opacity"
              style={{ backgroundColor: townColor }}
            >
              <span className={`flex-1 flex items-center gap-2 ${style.indent} py-3 pr-4`}>
                {headerContent}
              </span>
              <span className="px-4 py-3 text-white/80 font-medium text-sm tabular-nums whitespace-nowrap">
                {abbreviateCurrency(node.amounts[currentYear] || 0)}
              </span>
            </button>
          </td>
        </tr>
      ) : (
        <tr
          className="border-t border-gray-100 cursor-pointer hover:opacity-95 transition-opacity"
          style={{ backgroundColor: style.bg }}
          onClick={() => setCollapsed(c => !c)}
        >
          <td className={`${style.indent} py-2.5 pr-4 ${style.text}`}>
            {headerContent}
          </td>
          <td className="px-4 py-2.5 hidden sm:table-cell" />
          {amountCells}
        </tr>
      )}

      {/* Children */}
      {!collapsed && !node.isLeaf && node.children.map(child => (
        <NodeRow
          key={child.key}
          node={child}
          depth={depth + 1}
          levelNames={levelNames}
          displayYears={displayYears}
          currentYear={currentYear}
          townColor={townColor}
          lineItemTooltips={lineItemTooltips}
          colSpan={colSpan}
        />
      ))}

      {/* Leaf line items */}
      {!collapsed && node.isLeaf && node.rows?.map(row => (
        <tr key={row.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
          <td
            className="py-2 pr-4 text-gray-600 text-sm"
            style={{ paddingLeft: `${(depth + 2) * 1.25}rem` }}
          >
            {row.label}
            {lineItemTooltips[row.label] && (
              <span
                className="ml-1.5 text-[10px] text-gray-400 border border-gray-200 rounded-full px-1.5 py-px cursor-help"
                title={lineItemTooltips[row.label]}
              >?</span>
            )}
          </td>
          <td className="px-4 py-2 text-gray-400 text-xs hidden sm:table-cell">
            {row.objectCode || ""}
          </td>
          {displayYears.map(y => (
            <td key={y} className={`px-4 py-2 text-right tabular-nums text-sm ${(row.amounts[y] || 0) === 0 ? "text-gray-300" : "text-gray-700"}`}>
              {(row.amounts[y] || 0) === 0 ? "—" : formatCurrency(row.amounts[y])}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function DynamicExpenseTable({
  hierarchy,
  levelNames,
  years,
  currentYear,
  townColor = "#1e40af",
  lineItemTooltips = {},
}: DynamicExpenseTableProps) {
  const [visibleYears, setVisibleYears] = useState(() => years.slice(-3));
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [allCollapsed, setAllCollapsed] = useState(false);

  const displayYears = years.filter(y => visibleYears.includes(y));
  const colSpan = 2 + displayYears.length;

  // Grand totals
  const grandTotals: Record<string, number> = {};
  for (const y of displayYears) {
    grandTotals[y] = hierarchy.reduce((s, n) => s + (n.amounts[y] || 0), 0);
  }

  // Filter hierarchy by search (simple — just checks node keys recursively)
  const filterNodes = (nodes: HierarchyNode[], q: string): HierarchyNode[] => {
    if (!q) return nodes;
    return nodes.flatMap(n => {
      if (n.key.toLowerCase().includes(q)) return [n];
      if (n.isLeaf) {
        const matchingRows = n.rows?.filter(r => r.label.toLowerCase().includes(q) || (r.objectCode || "").toLowerCase().includes(q)) ?? [];
        if (matchingRows.length > 0) return [{ ...n, rows: matchingRows }];
        return [];
      }
      const filteredChildren = filterNodes(n.children, q);
      if (filteredChildren.length > 0) return [{ ...n, children: filteredChildren }];
      return [];
    });
  };

  const displayed = filterNodes(hierarchy, query.toLowerCase().trim());

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50/60">
        <input
          type="text"
          placeholder="Search accounts and line items…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {years.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setYearMenuOpen(o => !o)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50"
            >
              <span className="text-gray-700 font-medium">Years</span>
              <span className="text-gray-400 text-xs bg-gray-100 px-1.5 py-0.5 rounded">{visibleYears.length} shown</span>
              <svg className="w-3 h-3 text-gray-400" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {yearMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[9rem]">
                {[...years].reverse().map(y => (
                  <label key={y} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleYears.includes(y)}
                      onChange={() => setVisibleYears(prev =>
                        prev.includes(y)
                          ? prev.length > 1 ? prev.filter(x => x !== y) : prev
                          : years.filter(x => [...prev, y].includes(x))
                      )}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-gray-700">FY{y}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setAllCollapsed(c => !c)}
          className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 whitespace-nowrap"
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      {/* Hierarchy info */}
      {levelNames.length > 0 && (
        <div className="px-5 py-2 border-b border-gray-50 bg-gray-50/30 text-xs text-gray-400">
          Organized by: {levelNames.join(" → ")}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "540px" }}>
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Description</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 hidden sm:table-cell w-28">Account</th>
              {displayYears.map(y => (
                <th key={y} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap w-36"
                  style={{ color: y === currentYear ? townColor : "#9ca3af" }}>
                  FY{y}{y === currentYear && <span className="ml-1 normal-case font-normal opacity-60 text-[10px]">Budget</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody key={allCollapsed ? "collapsed" : "expanded"}>
            {displayed.map(node => (
              <NodeRow
                key={node.key}
                node={node}
                depth={0}
                levelNames={levelNames}
                displayYears={displayYears}
                currentYear={currentYear}
                townColor={townColor}
                lineItemTooltips={lineItemTooltips}
                colSpan={colSpan}
              />
            ))}

            {/* Grand total */}
            <tr className="border-t-2 border-gray-300 bg-gray-50/80">
              <td className="px-5 py-3 font-bold text-gray-900 text-sm" colSpan={2}>Total Expenses</td>
              {displayYears.map(y => (
                <td key={y} className="px-4 py-3 text-right tabular-nums font-bold text-gray-900 text-sm">
                  {formatCurrency(grandTotals[y] || 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
