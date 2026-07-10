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

// Returns a solid color equivalent of tint(hex, opacity) blended over white
// Use this for sticky cells — semi-transparent backgrounds don't cover content beneath them
function solidTint(hex: string, opacity: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const sr = Math.round(r * opacity + 255 * (1 - opacity));
  const sg = Math.round(g * opacity + 255 * (1 - opacity));
  const sb = Math.round(b * opacity + 255 * (1 - opacity));
  return `rgb(${sr},${sg},${sb})`;
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
          
          onClick={() => setCollapsed(c => !c)}
        >
          <td style={{ position: "sticky", left: 0, zIndex: 50, backgroundColor: solidTint(townColor, 0.18), padding: "10px 16px", boxShadow: "1px 0 0 0 rgba(0,0,0,0.04)" }}>
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
              <span style={{ fontWeight: 700, fontSize: 13, color: darkColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
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
          <td style={{ position: "sticky", left: 260, zIndex: 50, backgroundColor: solidTint(townColor, 0.18), padding: "10px 8px" }} />

          {displayCols.map(col => (
            <td
              key={col.colKey}
              className="px-4 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-sm"
              style={{
                backgroundColor: tint(townColor, 0.18),
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
          className="border-t border-gray-100 cursor-pointer transition-colors"
          
          onClick={() => setCollapsed(c => !c)}
        >
          <td style={{ position: "sticky", left: 0, zIndex: 50, backgroundColor: "rgb(248,250,248)", paddingTop: 8, paddingBottom: 8, paddingRight: 8, paddingLeft: `calc(${getIndent(depth)} + 1.25rem)` }}>
            <span className="inline-flex items-center gap-2">
              <span
                className="text-gray-400 text-[10px] flex-shrink-0 transition-transform duration-150"
                style={{ display: "inline-block", transform: effectiveCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
              >
                ▾
              </span>
              <span style={{ fontWeight: 600, fontSize: 12, color: "#374151", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{node.key}</span>
              {categoryTooltips[node.key] && (
                <span
                  title={categoryTooltips[node.key]}
                  className="ml-1.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold cursor-help flex-shrink-0 select-none bg-gray-200 text-gray-500"
                  aria-label={`Info: ${categoryTooltips[node.key]}`}
                >?</span>
              )}
            </span>
          </td>
          <td style={{ position: "sticky", left: 260, zIndex: 50, backgroundColor: "rgb(248,250,248)", padding: "8px 8px" }} />

          {displayCols.map(col => (
            <td
              key={col.colKey}
              className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-sm font-semibold text-gray-700"
              style={{ backgroundColor: "rgb(248,250,248)" }}
            >
              {formatCurrency(getAmt(node.amounts, col))}
            </td>
          ))}
        </tr>
      ) : (
        // Deeper group rows
        <tr
          className="border-t border-gray-50 cursor-pointer transition-colors"
          
          onClick={() => setCollapsed(c => !c)}
        >
          <td style={{ position: "sticky", left: 0, zIndex: 50, backgroundColor: "#ffffff", paddingTop: 6, paddingBottom: 6, paddingRight: 8, paddingLeft: `calc(${getIndent(depth)} + 1.25rem)` }}>
            <span className="inline-flex items-center gap-2">
              <span
                className="text-gray-300 text-[10px] flex-shrink-0 transition-transform duration-150"
                style={{ display: "inline-block", transform: effectiveCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
              >
                ▾
              </span>
              <span style={{ fontWeight: 500, fontSize: 12, color: "#4b5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{node.key}</span>
            </span>
          </td>
          <td style={{ position: "sticky", left: 260, zIndex: 50, backgroundColor: "#ffffff", padding: "6px 8px" }} />

          {displayCols.map(col => (
            <td
              key={col.colKey}
              className="px-4 py-2 text-right tabular-nums whitespace-nowrap text-sm text-gray-600 font-medium"
              style={{ backgroundColor: "#ffffff" }}
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
    <tr className="border-t border-gray-50 transition-colors group" >
      <td style={{ position: "sticky", left: 0, zIndex: 50, backgroundColor: "#ffffff", paddingTop: 5, paddingBottom: 5, paddingRight: 6, paddingLeft: `calc(${getIndent(depth)} + 1.25rem)`, color: "#6b7280", fontSize: 12, lineHeight: "1.3" }}>
        <span className="leading-snug inline-flex items-center gap-1">
          <span style={{ fontSize: 11, lineHeight: "1.3" }}>{row.label}</span>
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
        style={{ position: "sticky", left: 260, zIndex: 50, backgroundColor: "#ffffff", padding: "5px 6px", color: "#d1d5db", fontSize: 10, fontFamily: "monospace", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
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

      <div className="bg-white border border-gray-200/60 rounded-xl shadow-sm" style={{ overflow: "visible" }}>
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-2.5 bg-gray-50/40" style={{ borderRadius: "0.75rem 0.75rem 0 0" }}>
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
        <div style={{ overflowX: "auto" }} ref={tableScrollRef}>
          <table style={{ tableLayout: "fixed", borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
            <colgroup>
              <col style={{ width: 260 }} />
              <col style={{ width: 130 }} />
              {displayCols.map(col => <col key={col.colKey} style={{ width: 140 }} />)}
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb", backgroundColor: "#f9fafb" }}>
                <th style={{ position: "sticky", top: 0, left: 0, zIndex: 100, backgroundColor: "#f9fafb", padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af", whiteSpace: "nowrap", boxShadow: "2px 0 0 0 #e5e7eb" }}>
                  Description
                </th>
                <th style={{ position: "sticky", top: 0, left: 260, zIndex: 100, backgroundColor: "#f9fafb", padding: "10px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#d1d5db", whiteSpace: "nowrap" }}>
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
                <td style={{ position: "sticky", left: 0, zIndex: 50, backgroundColor: "#f9fafb", padding: "10px 16px", fontWeight: 700, color: "#111827", fontSize: 13 }}>
                  Total Expenses
                </td>
                <td style={{ position: "sticky", left: 260, zIndex: 50, backgroundColor: "#f9fafb" }} />
                {displayCols.map(col => (
                  <td
                    key={col.colKey}
                    className="px-4 py-3 text-right tabular-nums font-bold text-gray-900 text-sm whitespace-nowrap"
                    style={{ backgroundColor: "#f9fafb" }}
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
