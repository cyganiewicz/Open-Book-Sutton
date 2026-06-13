"use client";

import { useState } from "react";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import { type HierarchyNode } from "@/lib/expense-types";

interface YearTypeOption {
  year: string;
  type: "budget" | "actual";
  label: string;
  colKey: string; // e.g. "2025:budget" or "2025:actual"
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

const INDENT_REM = [1.25, 2.75, 4.25, 5.75, 7.25];
const getIndent = (depth: number) => `${INDENT_REM[Math.min(depth, INDENT_REM.length - 1)]}rem`;

// Each display column is a year+type pair
// amounts[col.colKey] holds the value (e.g. amounts["2025:actual"])
// Falls back to amounts[col.year] if explicit key missing
function getAmt(amounts: Record<string, number>, col: { year: string; colKey: string }): number {
  return amounts[col.colKey] ?? amounts[col.year] ?? 0;
}

function NodeRow({
  node, depth, displayCols, currentYear, townColor,
  lineItemTooltips, colCount, forceCollapsed,
}: {
  node: HierarchyNode;
  depth: number;
  displayCols: YearTypeOption[];
  currentYear: string;
  townColor: string;
  lineItemTooltips: Record<string, string>;
  colCount: number;
  forceCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const effectiveCollapsed = forceCollapsed || collapsed;
  const isTopLevel = depth === 0;

  const amountCells = displayCols.map(col => (
    <td key={col.colKey} className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-sm ${
      isTopLevel ? "text-white/90 font-medium" : "text-gray-700 font-semibold"
    }`}>
      {formatCurrency(getAmt(node.amounts, col))}
    </td>
  ));

  return (
    <>
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
        </tr>
      ) : (
        <tr
          className="border-t border-gray-100 cursor-pointer hover:opacity-95 transition-opacity"
          style={{ backgroundColor: depth === 1 ? tint(townColor, 0.07) : depth === 2 ? tint(townColor, 0.04) : "transparent" }}
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
          <td className="px-2 py-2.5 text-gray-300 text-xs font-mono" />
          {amountCells}
        </tr>
      )}

      {/* Children */}
      {!effectiveCollapsed && !node.isLeaf && node.children
        .filter(child => child.key !== "_direct")
        .map(child => (
          <NodeRow key={child.key} node={child} depth={depth + 1}
            displayCols={displayCols} currentYear={currentYear}
            townColor={townColor} lineItemTooltips={lineItemTooltips}
            colCount={colCount} forceCollapsed={false} />
        ))}

      {/* _direct rows rendered inline */}
      {!effectiveCollapsed && (() => {
        const direct = node.isLeaf ? null : node.children.find(c => c.key === "_direct");
        if (!direct) return null;
        return direct.rows?.map(row => (
          <LeafRow key={row.id} row={row} depth={depth + 1}
            displayCols={displayCols} lineItemTooltips={lineItemTooltips} />
        ));
      })()}

      {/* Leaf line items */}
      {!effectiveCollapsed && node.isLeaf && node.rows?.map(row => (
        <LeafRow key={row.id} row={row} depth={depth + 1}
          displayCols={displayCols} lineItemTooltips={lineItemTooltips} />
      ))}
    </>
  );
}

function LeafRow({ row, depth, displayCols, lineItemTooltips }: {
  row: { id: string; label: string; objectCode: string | null; amounts: Record<string, number> };
  depth: number;
  displayCols: YearTypeOption[];
  lineItemTooltips: Record<string, string>;
}) {
  const tooltip = lineItemTooltips[row.objectCode || ""] || lineItemTooltips[row.label] || "";
  return (
    <tr className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
      <td className="py-2 pr-2 text-gray-600 text-sm" style={{ paddingLeft: getIndent(depth) }}>
        <span title={tooltip || undefined}>{row.label}</span>
      </td>
      <td className="px-2 py-2 text-gray-300 text-[11px] font-mono truncate max-w-[10rem]"
        title={row.objectCode || ""}>
        {row.objectCode || ""}
      </td>
      {displayCols.map(col => (
        <td key={col.colKey} className={`px-3 py-2 text-right tabular-nums text-sm whitespace-nowrap ${
          getAmt(row.amounts, col) === 0 ? "text-gray-300" : "text-gray-700"
        }`}>
          {getAmt(row.amounts, col) === 0 ? "—" : formatCurrency(getAmt(row.amounts, col))}
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
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());

  const windowYears = years.slice(yearOffset, yearOffset + MAX_VISIBLE_YEARS);

  // Build display columns from yearTypeOptions for the visible window
  const displayCols: YearTypeOption[] = yearTypeOptions.length > 0
    ? yearTypeOptions.filter(o => windowYears.includes(o.year) && !hiddenCols.has(o.colKey))
    : windowYears.filter(y => !hiddenCols.has(y)).map(y => ({
        year: y,
        type: yearTypes[y] ?? (y === currentYear ? "budget" : "budget") as "budget" | "actual",
        label: `FY${y}`,
        colKey: y, // fallback: use plain year as colKey
      }));

  const canScrollLeft = yearOffset > 0;
  const canScrollRight = yearOffset + MAX_VISIBLE_YEARS < years.length;

  const colCount = 2 + displayCols.length;

  const grandTotals: Record<string, number> = {};
  for (const col of displayCols) {
    grandTotals[col.colKey] = hierarchy
      .filter(n => n.key !== "_direct")
      .reduce((s, n) => s + getAmt(n.amounts, col), 0);
  }

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

  // All available columns for the filter dropdown
  const allWindowCols: YearTypeOption[] = yearTypeOptions.length > 0
    ? yearTypeOptions.filter(o => windowYears.includes(o.year))
    : windowYears.map(y => ({
        year: y,
        type: yearTypes[y] ?? "budget" as "budget" | "actual",
        label: `FY${y} ${yearTypes[y] === "actual" ? "Actual" : "Budget"}`,
        colKey: y,
      }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50/60">
        <input
          type="text"
          placeholder="Search accounts and line items..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex items-center gap-1 border border-gray-200 rounded-lg bg-white overflow-hidden">
          <button onClick={() => setYearOffset(o => Math.max(0, o - 1))} disabled={!canScrollLeft}
            className="px-2.5 py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-gray-200">◀</button>
          <span className="px-3 py-2 text-xs text-gray-600 font-medium whitespace-nowrap">
            {windowYears.length > 1
              ? `FY${windowYears[0]} – FY${windowYears[windowYears.length - 1]}`
              : `FY${windowYears[0] ?? ""}`}
          </span>
          <button onClick={() => setYearOffset(o => Math.min(years.length - MAX_VISIBLE_YEARS, o + 1))} disabled={!canScrollRight}
            className="px-2.5 py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-gray-200">▶</button>
        </div>

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

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "560px" }}>
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Description</th>
              <th className="px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Account</th>
              {displayCols.map(col => (
                <th key={col.colKey}
                  className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                  style={{ minWidth: "130px", color: col.year === currentYear && col.type === "budget" ? townColor : "#9ca3af" }}>
                  FY{col.year}
                  <span className={`ml-1.5 normal-case font-medium text-[10px] px-1.5 py-0.5 rounded ${
                    col.type === "actual"
                      ? "bg-amber-100 text-amber-700"
                      : col.year === currentYear
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-500"
                  }`}>
                    {col.type === "actual" ? "Actual" : "Budget"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody key={`${allCollapsed}-${yearOffset}-${hiddenCols.size}`}>
            {displayed.map((node, i) => (
              <NodeRow key={node.key + i} node={node} depth={0}
                displayCols={displayCols} currentYear={currentYear}
                townColor={townColor} lineItemTooltips={lineItemTooltips}
                colCount={colCount} forceCollapsed={allCollapsed} />
            ))}
            <tr className="border-t-2 border-gray-300 bg-gray-50/80">
              <td className="px-5 py-3 font-bold text-gray-900 text-sm" colSpan={2}>Total Expenses</td>
              {displayCols.map(col => (
                <td key={col.colKey} className="px-3 py-3 text-right tabular-nums font-bold text-gray-900 text-sm whitespace-nowrap">
                  {formatCurrency(grandTotals[col.colKey] || 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
