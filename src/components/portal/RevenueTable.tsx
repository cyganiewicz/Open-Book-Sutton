"use client";

import { useState, useRef, useEffect } from "react";
import { formatCurrency } from "@/lib/format";
import type { RevHierarchyNode } from "./RevenueHeader";

interface YearTypeOption {
  year: string;
  type: "budget" | "actual";
  label: string;
  colKey: string;
}

interface RevenueTableProps {
  hierarchy: RevHierarchyNode[];
  years: string[];
  currentYear: string;
  yearTypes?: Record<string, "budget" | "actual">;
  yearTypeOptions?: YearTypeOption[];
  townColor: string;
  totalRevenue: number;
  levelNames: string[];
  lineItemTooltips?: Record<string, string>;
  categoryTooltips?: Record<string, string>;
}

function tint(hex: string, opacity: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

const INDENT_REM = [1.25, 2.75, 4.25, 5.75];
const getIndent = (depth: number) => `${INDENT_REM[Math.min(depth, INDENT_REM.length - 1)]}rem`;

function getAmt(amounts: Record<string, number>, col: { year: string; colKey: string }): number {
  return amounts[col.colKey] ?? amounts[col.year] ?? 0;
}

function NodeRow({
  node, depth, displayCols, currentYear, townColor, colCount, forceCollapsed, totalRevenue,
  categoryTooltips, lineItemTooltips,
}: {
  node: RevHierarchyNode;
  depth: number;
  displayCols: YearTypeOption[];
  currentYear: string;
  townColor: string;
  colCount: number;
  forceCollapsed: boolean;
  totalRevenue: number;
  categoryTooltips: Record<string, string>;
  lineItemTooltips: Record<string, string>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const effectiveCollapsed = forceCollapsed || collapsed;
  const isTopLevel = depth === 0;
  const curAmt = node.amounts[currentYear] || 0;
  const pct = totalRevenue > 0 ? ((curAmt / totalRevenue) * 100).toFixed(1) : "0";

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
              {categoryTooltips[node.key] && (
                <span title={categoryTooltips[node.key]}
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold cursor-help flex-shrink-0 bg-white/20 text-white"
                  aria-label={`Info: ${categoryTooltips[node.key]}`}>?</span>
              )}
            </span>
          </td>
          {displayCols.map(col => (
            <td key={col.colKey} className="px-3 py-3 text-right tabular-nums whitespace-nowrap"
              style={{
                color: col.year === currentYear && col.type === "budget" ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)",
                fontWeight: col.year === currentYear && col.type === "budget" ? "600" : "400",
                fontSize: col.year === currentYear && col.type === "budget" ? "0.9rem" : "0.8rem",
              }}>
              {formatCurrency(getAmt(node.amounts, col))}
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
              {categoryTooltips[node.key] && (
                <span title={categoryTooltips[node.key]}
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold cursor-help flex-shrink-0 bg-gray-200 text-gray-500"
                  aria-label={`Info: ${categoryTooltips[node.key]}`}>?</span>
              )}
            </span>
          </td>
          {displayCols.map(col => (
            <td key={col.colKey} className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-700 text-sm whitespace-nowrap">
              {formatCurrency(getAmt(node.amounts, col))}
            </td>
          ))}
          <td className="px-3 py-2.5 text-right text-gray-400 text-xs whitespace-nowrap">{pct}%</td>
        </tr>
      )}

      {!effectiveCollapsed && !node.isLeaf && node.children.map(child => (
        <NodeRow key={child.key} node={child} depth={depth + 1}
          displayCols={displayCols} currentYear={currentYear}
          townColor={townColor} colCount={colCount}
          forceCollapsed={false} totalRevenue={totalRevenue}
          categoryTooltips={categoryTooltips} lineItemTooltips={lineItemTooltips} />
      ))}

      {!effectiveCollapsed && node.isLeaf && node.rows?.map(row => (
        <tr key={row.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
          <td className="py-2 pr-3 text-gray-600 text-sm" style={{ paddingLeft: getIndent(depth + 1) }}>
            <span className="inline-flex items-center gap-1">
              {row.label}
              {(lineItemTooltips[row.label] || "") && (
                <span
                  title={lineItemTooltips[row.label]}
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold cursor-help flex-shrink-0 bg-gray-200 text-gray-400 hover:bg-gray-300"
                  aria-label="More info"
                >?</span>
              )}
            </span>
          </td>
          {displayCols.map(col => (
            <td key={col.colKey} className={`px-3 py-2 text-right tabular-nums text-sm whitespace-nowrap ${
              getAmt(row.amounts, col) === 0 ? "text-gray-300" : "text-gray-700"
            }`}>
              {getAmt(row.amounts, col) === 0 ? "—" : formatCurrency(getAmt(row.amounts, col))}
            </td>
          ))}
          <td className="px-3 py-2 text-right text-gray-300 text-xs">—</td>
        </tr>
      ))}
    </>
  );
}

export default function RevenueTable({
  hierarchy, years, currentYear, yearTypes = {}, yearTypeOptions = [],
  townColor, totalRevenue, levelNames,
  lineItemTooltips = {}, categoryTooltips = {},
}: RevenueTableProps) {
  const [query, setQuery] = useState("");
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Scroll to the right on mount so the most recent year is visible
  useEffect(() => {
    const el = tableScrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  // Show all years
  const displayCols: YearTypeOption[] = yearTypeOptions.length > 0
    ? yearTypeOptions.filter(o => !hiddenCols.has(o.colKey))
    : years.filter(y => !hiddenCols.has(y)).map(y => ({
        year: y,
        type: yearTypes[y] ?? (y === currentYear ? "budget" : "budget") as "budget" | "actual",
        label: `FY${y}`,
        colKey: y,
      }));

  const allWindowCols: YearTypeOption[] = yearTypeOptions.length > 0
    ? yearTypeOptions
    : years.map(y => ({
        year: y,
        type: yearTypes[y] ?? "budget" as "budget" | "actual",
        label: `FY${y} ${yearTypes[y] === "actual" ? "Actual" : "Budget"}`,
        colKey: y,
      }));

  const colCount = 1 + displayCols.length + 1;

  const grandTotals: Record<string, number> = {};
  for (const col of displayCols) {
    grandTotals[col.colKey] = hierarchy.reduce((s, n) => s + getAmt(n.amounts, col), 0);
  }

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

  const displayed = filterNodes(hierarchy, query.toLowerCase().trim());

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50/60">
        <input
          type="text"
          placeholder="Search revenue sources…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="relative">
          <button onClick={() => setFilterMenuOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
            <span className="text-gray-600">Columns</span>
            {hiddenCols.size > 0 && <span className="text-[10px] bg-blue-100 text-blue-600 rounded px-1">{hiddenCols.size} hidden</span>}
          </button>
          {filterMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[12rem]">
              <p className="px-3 pb-1 text-xs text-gray-400 font-medium uppercase tracking-wide">Show / hide columns</p>
              {allWindowCols.map(opt => (
                <label key={opt.colKey} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox"
                    checked={!hiddenCols.has(opt.colKey)}
                    onChange={() => setHiddenCols(prev => {
                      const next = new Set(prev);
                      next.has(opt.colKey) ? next.delete(opt.colKey) : next.add(opt.colKey);
                      return next;
                    })}
                    className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-gray-700">{opt.label}</span>
                  <span className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    opt.type === "actual" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                  }`}>
                    {opt.type === "actual" ? "Actual" : "Budget"}
                  </span>
                </label>
              ))}
              {hiddenCols.size > 0 && (
                <button onClick={() => setHiddenCols(new Set())}
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

      <div className="overflow-x-auto" ref={tableScrollRef}>
        <table className="w-full text-sm" style={{ minWidth: "480px" }}>
          <thead className="sticky top-0 z-10">
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
              {displayCols.map(col => (
                <th key={col.colKey} className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                  style={{ minWidth: "130px", color: col.year === currentYear && col.type === "budget" ? townColor : "#9ca3af" }}>
                  FY{col.year}
                  <span className={`ml-1.5 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded ${
                    col.type === "actual" ? "bg-amber-100 text-amber-700"
                    : col.year === currentYear ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-500"
                  }`}>
                    {col.type === "actual" ? "Actual" : "Budget"}
                  </span>
                </th>
              ))}
              <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400 w-16">%</th>
            </tr>
          </thead>
          <tbody key={`${allCollapsed}-${hiddenCols.size}`}>
            {displayed.map((node, i) => (
              <NodeRow key={node.key + i} node={node} depth={0}
                categoryTooltips={categoryTooltips}
                lineItemTooltips={lineItemTooltips}
                displayCols={displayCols} currentYear={currentYear}
                townColor={townColor} colCount={colCount}
                forceCollapsed={allCollapsed} totalRevenue={totalRevenue} />
            ))}
            <tr className="border-t-2 border-gray-300 bg-gray-50/80">
              <td className="px-5 py-3 font-bold text-gray-900 text-sm">Total Revenue</td>
              {displayCols.map(col => (
                <td key={col.colKey} className="px-3 py-3 text-right tabular-nums font-bold text-gray-900 text-sm whitespace-nowrap">
                  {formatCurrency(grandTotals[col.colKey] || 0)}
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
