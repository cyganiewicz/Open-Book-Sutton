"use client";

import { useState, useMemo } from "react";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";

interface LineItem {
  id: string;
  label: string;
  objectCode: string | null;
  amounts: Record<string, number>;
}

interface Department {
  name: string;
  total: number;
  items: LineItem[];
}

interface FunctionGroup {
  name: string;
  total: number;
  departments: Department[];
}

interface ExpenseTableProps {
  functionGroups: FunctionGroup[];
  years: string[];
  currentYear: string;
  townColor?: string;
  categoryTooltips?: Record<string, string>;
  lineItemTooltips?: Record<string, string>;
}

// Generates a slightly lighter tint of a hex color for dept headers
function tintColor(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export default function ExpenseTable({
  functionGroups,
  years,
  currentYear,
  townColor = "#1e40af",
  lineItemTooltips = {},
}: ExpenseTableProps) {
  const [collapsedFns, setCollapsedFns] = useState<Set<string>>(new Set());
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [visibleYears, setVisibleYears] = useState<string[]>(() => years.slice(-3));
  const [yearMenuOpen, setYearMenuOpen] = useState(false);

  const toggleFn = (fn: string) =>
    setCollapsedFns((prev) => {
      const next = new Set(prev);
      next.has(fn) ? next.delete(fn) : next.add(fn);
      return next;
    });

  const toggleDept = (key: string) =>
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const toggleYear = (y: string) =>
    setVisibleYears((prev) => {
      if (prev.includes(y)) return prev.length > 1 ? prev.filter((x) => x !== y) : prev;
      return [...years.filter((x) => [...prev, y].includes(x))]; // keep sorted
    });

  // When searching, show all matching rows ignoring collapse
  const searching = query.trim().length > 0;
  const q = query.toLowerCase();

  const displayedYears = years.filter((y) => visibleYears.includes(y));

  // Compute total for grand total row
  const grandTotal = useMemo(
    () => functionGroups.reduce((s, fg) => s + fg.total, 0),
    [functionGroups]
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Table toolbar */}
      <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50/60">
        <div className="flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Search line items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {years.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setYearMenuOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span className="text-gray-700 font-medium">Years</span>
              <span className="text-gray-400 text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                {visibleYears.length} shown
              </span>
              <svg className="w-3 h-3 text-gray-400" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {yearMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[9rem]">
                {[...years].reverse().map((y) => (
                  <label key={y} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleYears.includes(y)}
                      onChange={() => toggleYear(y)}
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
          onClick={() => {
            if (collapsedFns.size === functionGroups.length) {
              setCollapsedFns(new Set());
            } else {
              setCollapsedFns(new Set(functionGroups.map((fg) => fg.name)));
            }
          }}
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50 whitespace-nowrap"
        >
          {collapsedFns.size === functionGroups.length ? "Expand all" : "Collapse all"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "560px" }}>
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-full">
                Description
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap hidden sm:table-cell">
                Account
              </th>
              {displayedYears.map((y) => (
                <th
                  key={y}
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: y === currentYear ? townColor : undefined }}
                >
                  FY{y}
                  {y === currentYear && (
                    <span className="ml-1 text-[9px] font-normal opacity-70">Budget</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {functionGroups.map((fg) => {
              const fnCollapsed = collapsedFns.has(fg.name) && !searching;

              // Filter departments/items when searching
              const matchingDepts = searching
                ? fg.departments.filter(
                    (d) =>
                      d.name.toLowerCase().includes(q) ||
                      d.items.some(
                        (item) =>
                          item.label.toLowerCase().includes(q) ||
                          (item.objectCode || "").toLowerCase().includes(q)
                      )
                  )
                : fg.departments;

              if (searching && matchingDepts.length === 0) return null;

              return (
                <tbody key={fg.name}>
                  {/* Function area header row */}
                  <tr>
                    <td
                      colSpan={2 + displayedYears.length}
                      className="px-0 py-0 border-t border-gray-100"
                    >
                      <button
                        onClick={() => toggleFn(fg.name)}
                        disabled={searching}
                        className="w-full flex items-center gap-3 px-5 py-3 text-left text-white font-semibold text-sm transition-opacity hover:opacity-95 disabled:cursor-default"
                        style={{ backgroundColor: townColor }}
                      >
                        <span
                          className="text-white/70 text-xs transition-transform flex-shrink-0"
                          style={{
                            display: "inline-block",
                            transform: fnCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                          }}
                        >
                          ▾
                        </span>
                        <span className="flex-1 truncate">{fg.name}</span>
                        <span className="tabular-nums text-white/80 text-sm font-medium ml-auto pr-1 flex-shrink-0">
                          {abbreviateCurrency(fg.total)}
                        </span>
                      </button>
                    </td>
                  </tr>

                  {/* Departments */}
                  {!fnCollapsed &&
                    matchingDepts.map((dept) => {
                      const deptKey = `${fg.name}||${dept.name}`;
                      const deptCollapsed = collapsedDepts.has(deptKey) && !searching;

                      const matchingItems = searching
                        ? dept.items.filter(
                            (item) =>
                              item.label.toLowerCase().includes(q) ||
                              (item.objectCode || "").toLowerCase().includes(q) ||
                              dept.name.toLowerCase().includes(q)
                          )
                        : dept.items;

                      if (searching && matchingItems.length === 0 && !dept.name.toLowerCase().includes(q)) return null;

                      return (
                        <tbody key={deptKey}>
                          {/* Department sub-header */}
                          <tr
                            className="cursor-pointer select-none border-t border-gray-100"
                            style={{ backgroundColor: tintColor(townColor, 0.06) }}
                            onClick={() => toggleDept(deptKey)}
                          >
                            <td
                              className="px-5 py-2.5 font-semibold text-gray-800"
                              style={{ paddingLeft: "2.75rem" }}
                            >
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className="text-gray-400 text-xs transition-transform flex-shrink-0"
                                  style={{
                                    display: "inline-block",
                                    transform: deptCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                                  }}
                                >
                                  ▾
                                </span>
                                {dept.name}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 hidden sm:table-cell" />
                            {displayedYears.map((y) => (
                              <td key={y} className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-700">
                                {formatCurrency(
                                  dept.items.reduce((s, item) => s + (item.amounts[y] || 0), 0)
                                )}
                              </td>
                            ))}
                          </tr>

                          {/* Line items */}
                          {!deptCollapsed &&
                            matchingItems.map((item) => (
                              <tr
                                key={item.id}
                                className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors"
                              >
                                <td className="px-5 py-2 text-gray-600" style={{ paddingLeft: "4.5rem" }}>
                                  {item.label}
                                  {lineItemTooltips[item.label] && (
                                    <span
                                      className="ml-1.5 text-[10px] text-gray-400 border border-gray-200 rounded-full px-1.5 py-px cursor-help"
                                      title={lineItemTooltips[item.label]}
                                    >
                                      ?
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-gray-400 text-xs hidden sm:table-cell">
                                  {item.objectCode || ""}
                                </td>
                                {displayedYears.map((y) => (
                                  <td
                                    key={y}
                                    className={`px-4 py-2 text-right tabular-nums ${
                                      (item.amounts[y] || 0) === 0 ? "text-gray-300" : "text-gray-700"
                                    }`}
                                  >
                                    {(item.amounts[y] || 0) === 0
                                      ? "—"
                                      : formatCurrency(item.amounts[y])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      );
                    })}
                </tbody>
              );
            })}

            {/* Grand total footer */}
            <tr className="border-t-2 border-gray-300 bg-gray-50">
              <td className="px-5 py-3 font-bold text-gray-900" colSpan={2}>
                Total Expenses
              </td>
              {displayedYears.map((y) => (
                <td key={y} className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                  {formatCurrency(
                    functionGroups.reduce(
                      (s, fg) =>
                        s +
                        fg.departments.reduce(
                          (ds, d) =>
                            ds + d.items.reduce((is, item) => is + (item.amounts[y] || 0), 0),
                          0
                        ),
                      0
                    )
                  )}
                </td>
              ))}
            </tr>

            {searching && functionGroups.every((fg) =>
              fg.departments.every((d) =>
                !d.name.toLowerCase().includes(q) &&
                d.items.every(
                  (item) =>
                    !item.label.toLowerCase().includes(q) &&
                    !(item.objectCode || "").toLowerCase().includes(q)
                )
              )
            ) && (
              <tr>
                <td colSpan={2 + displayedYears.length} className="px-5 py-10 text-center text-gray-400 text-sm">
                  No items match &ldquo;{query}&rdquo;
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
