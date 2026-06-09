"use client";

import { useState, useRef, useCallback } from "react";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import { type HierarchyNode } from "@/lib/expense-types";

interface YearTypeOption {
  year: string;
  type: "budget" | "actual";
  label: string;
  available?: ("budget" | "actual")[];
}

interface DynamicExpenseTableProps {
  hierarchy: HierarchyNode[];
  levelNames: string[];
  years: string[];
  currentYear: string;
  yearTypes?: Record<string, "budget" | "actual">;
  yearTypeOptions?: YearTypeOption[];
  townColor?: string;
  lineItemTooltips?: Record<string, string>;
}

function tint(hex: string, opacity: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

// Visual depth styles
const INDENT_REM = [1.25, 2.75, 4.25, 5.75, 7.25];
const getIndent = (depth: number) => `${INDENT_REM[Math.min(depth, INDENT_REM.length - 1)]}rem`;


// Recursive node renderer
function NodeRow({
  node,
  depth,
  displayYears,
  currentYear,
  townColor,
  lineItemTooltips,
  colCount,
  forceCollapsed,
}: {
  node: HierarchyNode;
  depth: number;
  displayYears: string[];
  currentYear: string;
  townColor: string;
  lineItemTooltips: Record<string, string>;
  colCount: number;
  forceCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isTopLevel = depth === 0;
  const effectiveCollapsed = forceCollapsed || collapsed;

  // _direct means rows without this level's field — render inline without a header
  if (node.key === "_direct") {
    return (
      <>
        {!effectiveCollapsed && node.rows?.map(row => (
          <LeafRow key={row.id} row={row} depth={depth} displayYears={displayYears} lineItemTooltips={lineItemTooltips} />
        ))}
      </>
    );
  }

  const amountCells = displayYears.map(y => (
    <td key={y} className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-sm ${
      isTopLevel ? "text-white/90 font-medium" : "text-gray-700 font-semibold"
    }`}>
      {formatCurrency(node.amounts[y] || 0)}
    </td>
  ));

  return (
    <>
      {/* Group header */}
      {isTopLevel ? (
        <tr
          className="cursor-pointer hover:opacity-95 transition-opacity border-t border-gray-100"
          style={{ backgroundColor: townColor }}
          onClick={() => setCollapsed(c => !c)}
        >
          <td className="px-5 py-3" colSpan={2}>
            <span className="inline-flex items-center gap-2">
              <span className="text-white/60 text-xs flex-shrink-0 transition-transform duration-150"
                style={{ display: "inline-block", transform: effectiveCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
              <span className="text-white font-semibold text-sm">{node.key}</span>
            </span>
          </td>
          {displayYears.map(y => (
            <td key={y} className="px-3 py-3 text-right tabular-nums whitespace-nowrap"
              style={{ color: y === currentYear ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)",
                       fontWeight: y === currentYear ? "600" : "400",
                       fontSize: y === currentYear ? "0.9rem" : "0.8rem" }}>
              {formatCurrency(node.amounts[y] || 0)}
            </td>
          ))}
        </tr>
      ) : (
        <tr
          className="border-t border-gray-100 cursor-pointer hover:opacity-95 transition-opacity"
          style={{ backgroundColor: depth === 1 ? tint(townColor, 0.07) : depth === 2 ? tint(townColor, 0.03) : "transparent" }}
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
          {/* Account col spacer */}
          <td className="hidden sm:table-cell px-3 py-2.5" />
          {amountCells}
        </tr>
      )}

      {/* Children */}
      {!effectiveCollapsed && !node.isLeaf && node.children.map(child => (
        <NodeRow key={child.key} node={child} depth={depth + 1}
          displayYears={displayYears} currentYear={currentYear}
          townColor={townColor} lineItemTooltips={lineItemTooltips}
          colCount={colCount} forceCollapsed={false} />
      ))}

      {/* Leaf line items */}
      {!effectiveCollapsed && node.isLeaf && node.rows?.map(row => (
        <LeafRow key={row.id} row={row} depth={depth + 1}
          displayYears={displayYears} lineItemTooltips={lineItemTooltips} />
      ))}


    </>
  );
}

function LeafRow({ row, depth, displayYears, lineItemTooltips }: {
  row: { id: string; label: string; objectCode: string | null; amounts: Record<string, number> };
  depth: number;
  displayYears: string[];
  lineItemTooltips: Record<string, string>;
}) {
  return (
    <tr className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
      <td className="py-2 pr-3 text-gray-600 text-sm" style={{ paddingLeft: getIndent(depth) }}>
        {row.label}
        {lineItemTooltips[row.label] && (
          <span className="ml-1.5 text-[10px] text-gray-400 border border-gray-200 rounded-full px-1.5 py-px cursor-help"
            title={lineItemTooltips[row.label]}>?</span>
        )}
      </td>
      <td className="px-3 py-2 text-gray-400 text-xs hidden sm:table-cell whitespace-nowrap" style={{ minWidth: "180px" }}>
        {row.objectCode || ""}
      </td>
      {displayYears.map(y => (
        <td key={y} className={`px-3 py-2 text-right tabular-nums text-sm whitespace-nowrap ${
          (row.amounts[y] || 0) === 0 ? "text-gray-300" : "text-gray-700"
        }`}>
          {(row.amounts[y] || 0) === 0 ? "—" : formatCurrency(row.amounts[y])}
        </td>
      ))}
    </tr>
  );
}

export default function DynamicExpenseTable({
  hierarchy,
  levelNames,
  years,
  currentYear,
  yearTypes = {},
  yearTypeOptions = [],
  townColor = "#1e40af",
  lineItemTooltips = {},
}: DynamicExpenseTableProps) {
  const MAX_VISIBLE_YEARS = 3;
  const [yearOffset, setYearOffset] = useState(Math.max(0, years.length - MAX_VISIBLE_YEARS));
  const [query, setQuery] = useState("");
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  // One column per year. selectedTypes controls which amountType is shown per year.
  // Default: yearTypes from server (actual if available, else budget).
  const [selectedTypes, setSelectedTypes] = useState<Record<string, "budget" | "actual">>({});
  const [hiddenYears, setHiddenYears] = useState<Set<string>>(new Set());

  const windowYears = years.slice(yearOffset, yearOffset + MAX_VISIBLE_YEARS);
  const displayYears = windowYears.filter(y => !hiddenYears.has(y));

  // Effective type per year: user override > server default
  function effectiveType(y: string): "budget" | "actual" {
    return selectedTypes[y] ?? yearTypes[y] ?? (y === currentYear ? "budget" : "budget");
  }
  const canScrollLeft = yearOffset > 0;
  const canScrollRight = yearOffset + MAX_VISIBLE_YEARS < years.length;


  // Grand totals
  const grandTotals: Record<string, number> = {};
  for (const y of displayYears) {
    grandTotals[y] = hierarchy
      .filter(n => n.key !== "_direct")
      .reduce((s, n) => s + (n.amounts[y] || 0), 0);
  }
  const colCount = 2 + displayYears.length;

  // Simple recursive search filter
  const filterNodes = (nodes: HierarchyNode[], q: string): HierarchyNode[] => {
    if (!q) return nodes;
    return nodes.flatMap(n => {
      if (n.key === "_direct") {
        const matchingRows = n.rows?.filter(r =>
          r.label.toLowerCase().includes(q) || (r.objectCode || "").toLowerCase().includes(q)
        ) ?? [];
        return matchingRows.length > 0 ? [{ ...n, rows: matchingRows }] : [];
      }
      if (n.key.toLowerCase().includes(q)) return [n];
      if (n.isLeaf) {
        const matchingRows = n.rows?.filter(r =>
          r.label.toLowerCase().includes(q) || (r.objectCode || "").toLowerCase().includes(q)
        ) ?? [];
        return matchingRows.length > 0 ? [{ ...n, rows: matchingRows }] : [];
      }
      const filteredChildren = filterNodes(n.children, q);
      return filteredChildren.length > 0 ? [{ ...n, children: filteredChildren }] : [];
    });
  };

  const q = query.toLowerCase().trim();
  const displayed = filterNodes(hierarchy, q);

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

        {/* Year navigation */}
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg bg-white overflow-hidden">
          <button
            onClick={() => setYearOffset(o => Math.max(0, o - 1))}
            disabled={!canScrollLeft}
            className="px-2.5 py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-gray-200"
            title="Earlier years"
          >◀</button>
          <span className="px-3 py-2 text-xs text-gray-600 font-medium whitespace-nowrap">
            {years.length > 1
              ? `FY${years[yearOffset]} – FY${years[Math.min(yearOffset + MAX_VISIBLE_YEARS - 1, years.length - 1)]}`
              : `FY${years[0]}`}
          </span>
          <button
            onClick={() => setYearOffset(o => Math.min(years.length - MAX_VISIBLE_YEARS, o + 1))}
            disabled={!canScrollRight}
            className="px-2.5 py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-gray-200"
            title="Later years"
          >▶</button>
        </div>

        {/* Column filter */}
        <div className="relative">
          <button onClick={() => setFilterMenuOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
            <span className="text-gray-600">Columns</span>
            {hiddenYears.size > 0 && <span className="text-[10px] bg-blue-100 text-blue-600 rounded px-1">{hiddenYears.size} hidden</span>}
          </button>
          {filterMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[12rem]">
              <p className="px-3 pb-1 text-xs text-gray-400 font-medium uppercase tracking-wide">Show / hide columns</p>
              {windowYears.map(y => {
                const opt = yearTypeOptions.find(o => o.year === y);
                const available = opt?.available ?? [yearTypes[y] ?? "budget"];
                const hasBoth = available.includes("budget") && available.includes("actual");
                const curType = effectiveType(y);
                return (
                  <div key={y} className="px-3 py-1.5 hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <input type="checkbox"
                        checked={!hiddenYears.has(y)}
                        onChange={() => setHiddenYears(prev => {
                          const next = new Set(prev);
                          next.has(y) ? next.delete(y) : next.add(y);
                          return next;
                        })}
                        className="h-4 w-4 rounded border-gray-300 flex-shrink-0" />
                      <span className="text-gray-700 text-sm flex-1">FY{y}</span>
                      {!hasBoth && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${curType === "actual" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                          {curType === "actual" ? "Actual" : "Budget"}
                        </span>
                      )}
                    </div>
                    {hasBoth && (
                      <div className="ml-6 mt-1.5 flex gap-1">
                        <span className="text-xs text-gray-400 mr-1 self-center">Show:</span>
                        {(["budget","actual"] as const).map(t => (
                          <button key={t}
                            onClick={() => setSelectedTypes(prev => ({ ...prev, [y]: t }))}
                            className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                              curType === t
                                ? t === "actual" ? "bg-amber-500 text-white" : "bg-blue-600 text-white"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}>
                            {t === "actual" ? "Actual" : "Budget"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
          className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 whitespace-nowrap"
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      {/* Level breadcrumb */}
      {levelNames.length > 0 && (
        <div className="px-5 py-2 border-b border-gray-50 bg-gray-50/30 text-xs text-gray-400">
          Organized by: {levelNames.join(" → ")}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "560px" }}>
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Description
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 hidden sm:table-cell"
                style={{ minWidth: "180px" }}>
                Account
              </th>
              {displayYears.map(y => {
                const type = effectiveType(y);
                return (
                  <th key={y}
                    className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ minWidth: "130px", color: y === currentYear ? townColor : "#9ca3af" }}>
                    FY{y}
                    <span className={`ml-1.5 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded ${
                      type === "actual"
                        ? "bg-amber-100 text-amber-700"
                        : y === currentYear
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                    }`}>
                      {type === "actual" ? "Actual" : "Budget"}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody key={`${allCollapsed}-${yearOffset}`}>
            {displayed.map((node, i) => (
              <NodeRow key={node.key + i} node={node} depth={0}
                displayYears={displayYears} currentYear={currentYear}
                townColor={townColor} lineItemTooltips={lineItemTooltips}
                colCount={colCount} forceCollapsed={allCollapsed} />
            ))}

            {/* Grand total */}
            <tr className="border-t-2 border-gray-300 bg-gray-50/80">
              <td className="px-5 py-3 font-bold text-gray-900 text-sm" colSpan={2}>Total Expenses</td>
              {displayYears.map(y => (
                <td key={y} className="px-3 py-3 text-right tabular-nums font-bold text-gray-900 text-sm whitespace-nowrap">
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
