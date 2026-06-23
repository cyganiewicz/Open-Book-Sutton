"use client";

import { useState, useRef, useEffect } from "react";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import { type HierarchyNode } from "@/lib/expense-types";

interface YearTypeOption {
  year: string;
  type: "budget" | "actual";
  label: string;
  colKey: string;
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
  categoryTooltips?: Record<string, string>;
}

function tint(hex: string, opacity: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

const INDENT_REM = [0, 1.5, 3.0, 4.5, 6.0];
const getIndent = (depth: number) => `${INDENT_REM[Math.min(depth, INDENT_REM.length - 1)]}rem`;

function getAmt(amounts: Record<string, number>, col: { year: string; colKey: string }): number {
  return amounts[col.colKey] ?? amounts[col.year] ?? 0;
}

function NodeRow({
  node, depth, displayCols, currentYear, townColor,
  lineItemTooltips, categoryTooltips, forceCollapsed,
}: {
  node: HierarchyNode;
  depth: number;
  displayCols: YearTypeOption[];
  currentYear: string;
  townColor: string;
  lineItemTooltips: Record<string, string>;
  categoryTooltips: Record<string, string>;
  forceCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(depth >= 1);
  const effectiveCollapsed = forceCollapsed || collapsed;
  const isTopLevel = depth === 0;
  const isDepth1 = depth === 1;

  // Derive a darker shade for the function header text
  const r = parseInt(townColor.slice(1, 3), 16);
  const g = parseInt(townColor.slice(3, 5), 16);
  const b = parseInt(townColor.slice(5, 7), 16);
  const darkColor = `rgba(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 30)},1)`;

  return (
    <>
      {isTopLevel ? (
        // Function-level row: dark ink band, not heavy full-green
        <tr
          className="cursor-pointer transition-opacity border-t border-gray-200 group"
          style={{ backgroundColor: tint(townColor, 0.12) }}
          onClick={() => setCollapsed(c => !c)}
        >
          <td className="px-5 py-3" colSpan={2}>
            <span className="inline-flex items-center gap-2">
              <span
                className="text-[10px] flex-shrink-0 transition-transform duration-150"
                style={{
                  display: "inline-block",
                  transform: effectiveCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  color: darkColor,
                }}
              >
                ▾
              </span>
              <span className="font-bold text-sm" style={{ color: darkColor }}>
                {node.key}
              </span>
              {categoryTooltips[node.key] && (
                <span
                  title={categoryTooltips[node.key]}
                  className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold cursor-help flex-shrink-0 select-none"
                  style={{ backgroundColor: darkColor + "22", color: darkColor }}
                  aria-label={`Info: ${categoryTooltips[node.key]}`}
                >?</span>
              )}
            </span>
          </td>
          {displayCols.map(col => (
            <td
              key={col.colKey}
              className="px-4 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-sm"
              style={{
                color:
                  col.year === currentYear && col.type === "budget"
                    ? darkColor
                    : tint(townColor, 0.5).replace("rgba", "rgba").replace(",1)", ",0.6)"),
                opacity: col.year === currentYear && col.type === "budget" ? 1 : 0.65,
              }}
            >
              {formatCurrency(getAmt(node.amounts, col))}
            </td>
          ))}
        </tr>
      ) : isDepth1 ? (
        // Department-level row: soft sage tint
        <tr
          className="border-t border-gray-100 cursor-pointer hover:bg-gray-50/60 transition-colors"
          style={{ backgroundColor: "rgba(248,250,248,0.8)" }}
          onClick={() => setCollapsed(c => !c)}
        >
          <td className="py-2.5 pr-3" style={{ paddingLeft: `calc(${getIndent(depth)} + 1.25rem)` }}>
            <span className="inline-flex items-center gap-2">
              <span
                className="text-gray-400 text-[10px] flex-shrink-0 transition-transform duration-150"
                style={{ display: "inline-block", transform: effectiveCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
              >
                ▾
              </span>
              <span className="font-semibold text-gray-700 text-sm">{node.key}</span>
              {categoryTooltips[node.key] && (
                <span
                  title={categoryTooltips[node.key]}
                  className="ml-1.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold cursor-help flex-shrink-0 select-none bg-gray-200 text-gray-500"
                  aria-label={`Info: ${categoryTooltips[node.key]}`}
                >?</span>
              )}
            </span>
          </td>
          <td className="px-2 py-2.5 text-gray-300 text-[11px] font-mono" />
          {displayCols.map(col => (
            <td
              key={col.colKey}
              className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-sm font-semibold text-gray-700"
            >
              {formatCurrency(getAmt(node.amounts, col))}
            </td>
          ))}
        </tr>
      ) : (
        // Deeper group rows
        <tr
          className="border-t border-gray-50 cursor-pointer hover:bg-gray-50/40 transition-colors"
          onClick={() => setCollapsed(c => !c)}
        >
          <td className="py-2 pr-3" style={{ paddingLeft: `calc(${getIndent(depth)} + 1.25rem)` }}>
            <span className="inline-flex items-center gap-2">
              <span
                className="text-gray-300 text-[10px] flex-shrink-0 transition-transform duration-150"
                style={{ display: "inline-block", transform: effectiveCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
              >
                ▾
              </span>
              <span className="font-medium text-gray-600 text-sm">{node.key}</span>
            </span>
          </td>
          <td className="px-2 py-2 text-gray-300 text-[11px] font-mono" />
          {displayCols.map(col => (
            <td
              key={col.colKey}
              className="px-4 py-2 text-right tabular-nums whitespace-nowrap text-sm text-gray-600 font-medium"
            >
              {formatCurrency(getAmt(node.amounts, col))}
            </td>
          ))}
        </tr>
      )}

      {/* Children */}
      {!effectiveCollapsed && !node.isLeaf && node.children
        .filter(child => child.key !== "_direct")
        .map(child => (
          <NodeRow
            key={child.key}
            node={child}
            depth={depth + 1}
            displayCols={displayCols}
            currentYear={currentYear}
            townColor={townColor}
            lineItemTooltips={lineItemTooltips}
              categoryTooltips={categoryTooltips}
            forceCollapsed={false}
          />
        ))}

      {/* _direct rows */}
      {!effectiveCollapsed && (() => {
        const direct = node.isLeaf ? null : node.children.find(c => c.key === "_direct");
        if (!direct) return null;
        return direct.rows?.map(row => (
          <LeafRow
            key={row.id}
            row={row}
            depth={depth + 1}
            displayCols={displayCols}
            lineItemTooltips={lineItemTooltips}
              categoryTooltips={categoryTooltips}
          />
        ));
      })()}

      {/* Leaf line items */}
      {!effectiveCollapsed && node.isLeaf && node.rows?.map(row => (
        <LeafRow
          key={row.id}
          row={row}
          depth={depth + 1}
          displayCols={displayCols}
          lineItemTooltips={lineItemTooltips}
              categoryTooltips={categoryTooltips}
        />
      ))}
    </>
  );
}

function LeafRow({
  row, depth, displayCols, lineItemTooltips,
}: {
  row: { id: string; label: string; objectCode: string | null; amounts: Record<string, number> };
  depth: number;
  displayCols: YearTypeOption[];
  lineItemTooltips: Record<string, string>;
}) {
  const tooltip = lineItemTooltips[row.objectCode || ""] || lineItemTooltips[row.label] || "";
  return (
    <tr className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td
        className="py-1.5 pr-2 text-gray-500 text-sm"
        style={{ paddingLeft: `calc(${getIndent(depth)} + 1.25rem)` }}
      >
        <span className="leading-snug inline-flex items-center gap-1">
          {row.label}
          {tooltip && (
            <span
              title={tooltip}
              className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold cursor-help flex-shrink-0 select-none bg-gray-200 text-gray-400 hover:bg-gray-300"
              aria-label={`Info: ${tooltip}`}
            >?</span>
          )}
        </span>
      </td>
      <td
        className="px-2 py-1.5 text-gray-300 text-[10px] font-mono truncate max-w-[8rem]"
        title={row.objectCode || ""}
      >
        {row.objectCode || ""}
      </td>
      {displayCols.map(col => (
        <td
          key={col.colKey}
          className={`px-4 py-1.5 text-right tabular-nums text-sm whitespace-nowrap ${
            getAmt(row.amounts, col) === 0 ? "text-gray-200" : "text-gray-600"
          }`}
        >
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
  townColor = "#2d6a4f",
  lineItemTooltips = {},
  categoryTooltips = {},
}: DynamicExpenseTableProps) {
  const [query, setQuery] = useState("");
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
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

  const allWindowCols: YearTypeOption[] = yearTypeOptions.length > 0
    ? yearTypeOptions
    : years.map(y => ({
        year: y,
        type: yearTypes[y] ?? "budget" as "budget" | "actual",
        label: `FY${y} ${yearTypes[y] === "actual" ? "Actual" : "Budget"}`,
        colKey: y,
      }));

  return (
    <div>
      {/* Section heading */}
      <div className="mb-4">
        <h2
          className="text-lg font-bold text-gray-900"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Expense Detail Explorer
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {levelNames.length > 0
            ? `Organized by: ${levelNames.join(" → ")}`
            : "Account-level budget detail"}
        </p>
      </div>

      <div className="bg-white border border-gray-200/60 rounded-xl overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-2.5 bg-gray-50/40">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-sm pointer-events-none">
              ⌕
            </span>
            <input
              type="text"
              placeholder="Search accounts and line items…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 transition-shadow"
              style={{ "--tw-ring-color": townColor } as React.CSSProperties}
            />
          </div>

          {/* Columns menu */}
          <div className="relative">
            <button
              onClick={() => setFilterMenuOpen(o => !o)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <span className="text-gray-600 text-xs font-medium">Columns</span>
              {hiddenCols.size > 0 && (
                <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1 font-bold">
                  {hiddenCols.size} hidden
                </span>
              )}
            </button>
            {filterMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-2 min-w-[13rem]">
                <p className="px-3 pb-2 pt-1 text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                  Show / hide columns
                </p>
                {allWindowCols.map(opt => (
                  <label
                    key={opt.colKey}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(opt.colKey)}
                      onChange={() =>
                        setHiddenCols(prev => {
                          const next = new Set(prev);
                          next.has(opt.colKey) ? next.delete(opt.colKey) : next.add(opt.colKey);
                          return next;
                        })
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300 accent-green-700"
                    />
                    <span className="text-gray-700 flex-1 text-xs">{opt.label}</span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        opt.type === "actual"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {opt.type === "actual" ? "Actual" : "Budget"}
                    </span>
                  </label>
                ))}
                {hiddenCols.size > 0 && (
                  <button
                    onClick={() => setHiddenCols(new Set())}
                    className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-gray-50 border-t border-gray-100 mt-1 font-medium"
                  >
                    Show all columns
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Collapse control */}
          <button
            onClick={() => setAllCollapsed(c => !c)}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 whitespace-nowrap transition-colors font-medium"
          >
            {allCollapsed ? "Expand all" : "Collapse to functions"}
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto" ref={tableScrollRef}>
          <table className="w-full text-sm" style={{ minWidth: "560px" }}>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Description
                </th>
                <th className="px-2 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-300">
                  Acct
                </th>
                {displayCols.map(col => (
                  <th
                    key={col.colKey}
                    className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                    style={{ minWidth: "130px" }}
                  >
                    <span
                      className="block"
                      style={{
                        color:
                          col.year === currentYear && col.type === "budget"
                            ? townColor
                            : "#9ca3af",
                      }}
                    >
                      FY{col.year}
                    </span>
                    <span
                      className={`inline-block mt-0.5 normal-case font-semibold text-[10px] px-1.5 py-0.5 rounded ${
                        col.type === "actual"
                          ? "bg-amber-100 text-amber-700"
                          : col.year === currentYear
                          ? "bg-blue-50 text-blue-600"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {col.type === "actual" ? "Actual" : "Budget"}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody key={`${allCollapsed}-${hiddenCols.size}`}>
              {displayed.map((node, i) => (
                <NodeRow
                  key={node.key + i}
                  node={node}
                  depth={0}
                  displayCols={displayCols}
                  currentYear={currentYear}
                  townColor={townColor}
                  lineItemTooltips={lineItemTooltips}
              categoryTooltips={categoryTooltips}
                  forceCollapsed={allCollapsed}
                />
              ))}
              {/* Grand total row */}
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="px-5 py-3 font-bold text-gray-900 text-sm" colSpan={2}>
                  Total Expenses
                </td>
                {displayCols.map(col => (
                  <td
                    key={col.colKey}
                    className="px-4 py-3 text-right tabular-nums font-bold text-gray-900 text-sm whitespace-nowrap"
                  >
                    {formatCurrency(grandTotals[col.colKey] || 0)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        {query && displayed.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No results for &ldquo;{query}&rdquo; — try a different search term
          </div>
        )}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40">
          <p className="text-[10px] text-gray-400">
            Showing {displayed.length} of {hierarchy.length} function areas ·{" "}
            {displayCols.map(c => c.label).join(", ")} ·{" "}
            Grand total: {abbreviateCurrency(grandTotals[displayCols[displayCols.length - 1]?.colKey] || 0)}
          </p>
        </div>
      </div>
    </div>
  );
}
