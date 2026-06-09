"use client";

import { useState } from "react";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";

interface ExpLineItem {
  id: string;
  label: string;
  objectCode: string | null;
  amounts: Record<string, number>;
}

interface ExpCat2 {
  name: string;
  amounts: Record<string, number>;
  items: ExpLineItem[];
}

interface ExpCat1 {
  name: string;
  amounts: Record<string, number>;
  subCategories: ExpCat2[];
  items: ExpLineItem[];
}

interface ExpDept {
  name: string;
  amounts: Record<string, number>;
  categories: ExpCat1[];
  items: ExpLineItem[];
}

interface ExpFn {
  name: string;
  amounts: Record<string, number>;
  departments: ExpDept[];
}

interface ExpenseTableProps {
  functionGroups: ExpFn[];
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

export default function ExpenseTable({
  functionGroups,
  years,
  currentYear,
  townColor = "#1e40af",
  lineItemTooltips = {},
}: ExpenseTableProps) {
  const [collapsedFns, setCollapsedFns] = useState<Set<string>>(new Set());
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [collapsedCat1s, setCollapsedCat1s] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [visibleYears, setVisibleYears] = useState<string[]>(() => years.slice(-3));
  const [yearMenuOpen, setYearMenuOpen] = useState(false);

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  };

  const searching = query.trim().length > 0;
  const q = query.toLowerCase();
  const displayYears = years.filter((y) => visibleYears.includes(y));

  const allFnsCollapsed = collapsedFns.size === functionGroups.length;

  // Grand total across all displayed years
  const grandTotals: Record<string, number> = {};
  for (const y of displayYears) {
    grandTotals[y] = functionGroups.reduce(
      (s, fg) => s + (fg.amounts[colKey(y,'budget')] || fg.amounts[colKey(y,'actual')] || 0),
      0
    );
  }

  // Helper: does an item match search
  const itemMatches = (item: ExpLineItem) =>
    item.label.toLowerCase().includes(q) ||
    (item.objectCode || "").toLowerCase().includes(q);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 bg-gray-50/60">
        <input
          type="text"
          placeholder="Search accounts and line items…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />

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
              <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[9rem]">
                {[...years].reverse().map((y) => (
                  <label key={y} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleYears.includes(y)}
                      onChange={() =>
                        setVisibleYears((prev) =>
                          prev.includes(y)
                            ? prev.length > 1 ? prev.filter((x) => x !== y) : prev
                            : years.filter((x) => [...prev, y].includes(x))
                        )
                      }
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
          onClick={() =>
            setCollapsedFns(
              allFnsCollapsed ? new Set() : new Set(functionGroups.map((fg) => fg.name))
            )
          }
          className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 whitespace-nowrap"
        >
          {allFnsCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: "560px" }}>
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Description
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 hidden sm:table-cell w-28">
                Account
              </th>
              {displayYears.map((y) => (
                <th
                  key={y}
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap w-36"
                  style={{ color: y === currentYear ? townColor : "#9ca3af" }}
                >
                  FY{y}
                  {y === currentYear && <span className="ml-1 normal-case font-normal opacity-60 text-[10px]">Budget</span>}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {functionGroups.map((fg) => {
              const fnCollapsed = !searching && collapsedFns.has(fg.name);

              const visibleDepts = searching
                ? fg.departments.filter(
                    (d) =>
                      d.name.toLowerCase().includes(q) ||
                      d.items.some(itemMatches) ||
                      d.categories.some(
                        (c1) =>
                          c1.name.toLowerCase().includes(q) ||
                          c1.items.some(itemMatches) ||
                          c1.subCategories.some(
                            (c2) =>
                              c2.name.toLowerCase().includes(q) ||
                              c2.items.some(itemMatches)
                          )
                      )
                  )
                : fg.departments;

              if (searching && visibleDepts.length === 0 && !fg.name.toLowerCase().includes(q))
                return null;

              return (
                <tbody key={fg.name}>
                  {/* ── Function area header ── */}
                  <tr>
                    <td colSpan={2 + displayYears.length} className="p-0 border-t border-gray-100">
                      <button
                        onClick={() => setCollapsedFns(toggle(collapsedFns, fg.name))}
                        disabled={searching}
                        className="w-full flex items-center gap-3 px-5 py-3 text-white font-semibold text-sm hover:opacity-95 transition-opacity disabled:cursor-default"
                        style={{ backgroundColor: townColor }}
                      >
                        <span
                          className="text-white/60 text-xs flex-shrink-0 transition-transform duration-150"
                          style={{ display: "inline-block", transform: fnCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                        >▾</span>
                        <span className="flex-1 text-left">{fg.name}</span>
                        <span className="tabular-nums text-white/80 font-medium text-sm flex-shrink-0">
                          {abbreviateCurrency(fg.amounts[colKey(currentYear,'budget')] || fg.amounts[colKey(currentYear,'actual')] || 0)}
                        </span>
                      </button>
                    </td>
                  </tr>

                  {!fnCollapsed && visibleDepts.map((dept) => {
                    const deptKey = `${fg.name}|${dept.name}`;
                    const deptCollapsed = !searching && collapsedDepts.has(deptKey);

                    return (
                      <tbody key={deptKey}>
                        {/* ── Department row ── */}
                        <tr
                          className="cursor-pointer hover:opacity-95 border-t border-white/30"
                          style={{ backgroundColor: tint(townColor, 0.08) }}
                          onClick={() => !searching && setCollapsedDepts(toggle(collapsedDepts, deptKey))}
                        >
                          <td className="px-5 py-2.5 font-semibold text-gray-800" style={{ paddingLeft: "2.75rem" }}>
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="text-gray-400 text-xs flex-shrink-0 transition-transform duration-150"
                                style={{ display: "inline-block", transform: deptCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                              >▾</span>
                              {dept.name}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell" />
                          {displayYears.map((y) => (
                            <td key={y} className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-700">
                              {formatCurrency(dept.amounts[colKey(y,'budget')] || dept.amounts[colKey(y,'actual')] || 0)}
                            </td>
                          ))}
                        </tr>

                        {!deptCollapsed && (
                          <>
                            {/* Flat items (no categories) */}
                            {dept.items.map((item) => (
                              (!searching || itemMatches(item)) && (
                                <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                                  <td className="px-5 py-2 text-gray-600" style={{ paddingLeft: "4.5rem" }}>
                                    {item.label}
                                    {lineItemTooltips[item.label] && (
                                      <span className="ml-1.5 text-[10px] text-gray-400 border border-gray-200 rounded-full px-1.5 py-px cursor-help" title={lineItemTooltips[item.label]}>?</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-gray-400 text-xs hidden sm:table-cell">{item.objectCode || ""}</td>
                                  {displayYears.map((y) => (
                                    <td key={y} className={`px-4 py-2 text-right tabular-nums ${(item.amounts[colKey(y,'budget')] || item.amounts[colKey(y,'actual')] || 0) === 0 ? "text-gray-300" : "text-gray-700"}`}>
                                      {(item.amounts[colKey(y,'budget')] || item.amounts[colKey(y,'actual')] || 0) === 0 ? "—" : formatCurrency(item.amounts[colKey(y,'budget')] || item.amounts[colKey(y,'actual')] || 0)}
                                    </td>
                                  ))}
                                </tr>
                              )
                            ))}

                            {/* Category 1 groups */}
                            {dept.categories.map((cat1) => {
                              const cat1Key = `${deptKey}|${cat1.name}`;
                              const cat1Collapsed = !searching && collapsedCat1s.has(cat1Key);
                              const cat1Matches = cat1.name.toLowerCase().includes(q);
                              const cat1ItemsMatch = cat1.items.some(itemMatches) ||
                                cat1.subCategories.some((c2) => c2.name.toLowerCase().includes(q) || c2.items.some(itemMatches));
                              if (searching && !cat1Matches && !cat1ItemsMatch) return null;

                              return (
                                <tbody key={cat1Key}>
                                  <tr
                                    className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                                    style={{ backgroundColor: tint(townColor, 0.03) }}
                                    onClick={() => !searching && setCollapsedCat1s(toggle(collapsedCat1s, cat1Key))}
                                  >
                                    <td className="px-5 py-2 font-medium text-gray-700" style={{ paddingLeft: "4rem" }}>
                                      <span className="inline-flex items-center gap-2">
                                        <span
                                          className="text-gray-300 text-xs flex-shrink-0 transition-transform duration-150"
                                          style={{ display: "inline-block", transform: cat1Collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                                        >▾</span>
                                        {cat1.name}
                                      </span>
                                    </td>
                                    <td className="hidden sm:table-cell" />
                                    {displayYears.map((y) => (
                                      <td key={y} className="px-4 py-2 text-right tabular-nums font-medium text-gray-600">
                                        {formatCurrency(cat1.amounts[colKey(y,'budget')] || cat1.amounts[colKey(y,'actual')] || 0)}
                                      </td>
                                    ))}
                                  </tr>

                                  {!cat1Collapsed && (
                                    <>
                                      {/* Cat1 direct items */}
                                      {cat1.items.map((item) => (
                                        (!searching || itemMatches(item)) && (
                                          <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                                            <td className="px-5 py-1.5 text-gray-500 text-xs" style={{ paddingLeft: "5.5rem" }}>{item.label}</td>
                                            <td className="px-4 py-1.5 text-gray-400 text-xs hidden sm:table-cell">{item.objectCode || ""}</td>
                                            {displayYears.map((y) => (
                                              <td key={y} className={`px-4 py-1.5 text-right tabular-nums text-xs ${(item.amounts[colKey(y,'budget')] || item.amounts[colKey(y,'actual')] || 0) === 0 ? "text-gray-300" : "text-gray-600"}`}>
                                                {(item.amounts[colKey(y,'budget')] || item.amounts[colKey(y,'actual')] || 0) === 0 ? "—" : formatCurrency(item.amounts[colKey(y,'budget')] || item.amounts[colKey(y,'actual')] || 0)}
                                              </td>
                                            ))}
                                          </tr>
                                        )
                                      ))}

                                      {/* Cat2 subgroups */}
                                      {cat1.subCategories.map((cat2) => {
                                        if (searching && !cat2.name.toLowerCase().includes(q) && !cat2.items.some(itemMatches)) return null;
                                        return (
                                          <tbody key={cat2.name}>
                                            <tr className="border-t border-gray-50 bg-gray-50/30">
                                              <td className="px-5 py-1.5 text-gray-500 font-medium text-xs" style={{ paddingLeft: "5.5rem" }}>{cat2.name}</td>
                                              <td className="hidden sm:table-cell" />
                                              {displayYears.map((y) => (
                                                <td key={y} className="px-4 py-1.5 text-right tabular-nums font-medium text-gray-500 text-xs">
                                                  {formatCurrency(cat2.amounts[colKey(y,'budget')] || cat2.amounts[colKey(y,'actual')] || 0)}
                                                </td>
                                              ))}
                                            </tr>
                                            {cat2.items.map((item) => (
                                              (!searching || itemMatches(item)) && (
                                                <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                                                  <td className="px-5 py-1.5 text-gray-400 text-xs" style={{ paddingLeft: "7rem" }}>{item.label}</td>
                                                  <td className="px-4 py-1.5 text-gray-300 text-xs hidden sm:table-cell">{item.objectCode || ""}</td>
                                                  {displayYears.map((y) => (
                                                    <td key={y} className={`px-4 py-1.5 text-right tabular-nums text-xs ${(item.amounts[colKey(y,'budget')] || item.amounts[colKey(y,'actual')] || 0) === 0 ? "text-gray-200" : "text-gray-500"}`}>
                                                      {(item.amounts[colKey(y,'budget')] || item.amounts[colKey(y,'actual')] || 0) === 0 ? "—" : formatCurrency(item.amounts[colKey(y,'budget')] || item.amounts[colKey(y,'actual')] || 0)}
                                                    </td>
                                                  ))}
                                                </tr>
                                              )
                                            ))}
                                          </tbody>
                                        );
                                      })}
                                    </>
                                  )}
                                </tbody>
                              );
                            })}
                          </>
                        )}
                      </tbody>
                    );
                  })}
                </tbody>
              );
            })}

            {/* Grand total */}
            <tr className="border-t-2 border-gray-300 bg-gray-50/80">
              <td className="px-5 py-3 font-bold text-gray-900 text-sm" colSpan={2}>Total Expenses</td>
              {displayYears.map((y) => (
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
