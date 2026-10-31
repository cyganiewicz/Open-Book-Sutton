"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import type {
  CheckbookFilters, CheckbookOverview, CheckbookSearchResult, RankedItem, WarrantSummary,
} from "@/lib/checkbook/public";

interface Props {
  townSlug: string;
  color: string;
  overview: CheckbookOverview;
  initialData: CheckbookSearchResult;
  initialFilters: CheckbookFilters;
}

const fmtDate = (iso: string | null, withYear = true) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
      })
    : "—";

function dateRange(a: string | null, b: string | null): string {
  if (!a) return "";
  const first = fmtDate(a, false);
  const last = fmtDate(b ?? a, false);
  if (first === last) return first;
  const [m1, d1] = first.split(" ");
  const [m2, d2] = last.split(" ");
  return m1 === m2 ? `${m1} ${d1}–${d2}` : `${first} – ${last}`;
}

const warrantLabel = (w: string) => (w ? `Warrant ${w}` : "Direct pay");
const NONE = "__none__";

function toQuery(f: CheckbookFilters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("fy", f.fiscalYear ?? "all");
  if (f.warrant) p.set("warrant", f.warrant);
  if (f.functionArea) p.set("fn", f.functionArea);
  if (f.department) p.set("dept", f.department);
  if (f.category) p.set("cat", f.category);
  if (f.vendorId) p.set("vendor", f.vendorId);
  if (f.q) p.set("q", f.q);
  if (f.minAmount !== undefined) p.set("min", String(f.minAmount));
  if (f.maxAmount !== undefined) p.set("max", String(f.maxAmount));
  if (f.sort && f.sort !== "date") p.set("sort", f.sort);
  if (f.dir === "asc") p.set("dir", "asc");
  if (f.page && f.page > 1) p.set("page", String(f.page));
  return p;
}

export default function CheckbookClient({ townSlug, color, overview, initialData, initialFilters }: Props) {
  const [filters, setFilters] = useState<CheckbookFilters>(initialFilters);
  const [data, setData] = useState<CheckbookSearchResult>(initialData);
  const [qInput, setQInput] = useState(initialFilters.q ?? "");
  const [minInput, setMinInput] = useState(initialFilters.minAmount?.toString() ?? "");
  const [maxInput, setMaxInput] = useState(initialFilters.maxAmount?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const firstRun = useRef(true);

  const update = useCallback((patch: Partial<CheckbookFilters>) => {
    setFilters(prev => ({ ...prev, page: 1, ...patch }));
  }, []);

  // Debounce the free-text and amount inputs
  useEffect(() => {
    const t = setTimeout(() => {
      const min = minInput.trim() === "" ? undefined : Number(minInput);
      const max = maxInput.trim() === "" ? undefined : Number(maxInput);
      setFilters(prev => {
        const next = {
          ...prev, q: qInput.trim() || undefined,
          minAmount: min !== undefined && Number.isFinite(min) ? min : undefined,
          maxAmount: max !== undefined && Number.isFinite(max) ? max : undefined,
        };
        const same = next.q === prev.q && next.minAmount === prev.minAmount && next.maxAmount === prev.maxAmount;
        return same ? prev : { ...next, page: 1 };
      });
    }, 300);
    return () => clearTimeout(t);
  }, [qInput, minInput, maxInput]);

  // Fetch whenever filters change (the first render already has server data)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const qs = toQuery(filters).toString();
    window.history.replaceState(null, "", `?${qs}`);
    const ctrl = new AbortController();
    setLoading(true); setError(false);
    fetch(`/api/public/checkbook/${townSlug}?${qs}`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error("bad"); return r.json() as Promise<CheckbookSearchResult>; })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { if (e.name !== "AbortError") { setError(true); setLoading(false); } });
    return () => ctrl.abort();
  }, [filters, townSlug]);

  const vendorLabel = filters.vendorId ? data.topVendors.find(v => v.id === filters.vendorId)?.label ?? "Selected vendor" : null;
  const anyFilter = !!(filters.warrant || filters.functionArea || filters.department || filters.category || filters.vendorId ||
    filters.q || filters.minAmount !== undefined || filters.maxAmount !== undefined);
  const exportQs = (() => { const p = toQuery(filters); p.delete("page"); return p.toString(); })();
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const firstShown = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastShown = Math.min(data.page * data.pageSize, data.total);

  const reset = () => {
    setQInput(""); setMinInput(""); setMaxInput("");
    setFilters(prev => ({ fiscalYear: prev.fiscalYear, sort: "date", dir: "desc", page: 1, pageSize: prev.pageSize }));
  };

  const toggleSort = (col: "date" | "vendor" | "amount") => {
    setFilters(prev => ({
      ...prev, page: 1, sort: col,
      dir: prev.sort === col && prev.dir === "desc" ? "asc" : "desc",
    }));
  };

  const maxWarrant = Math.max(1, ...data.warrants.map(w => Math.abs(w.total)));

  return (
    <div className="space-y-12 pb-8">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section aria-label="Summary" className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-end">
        <div className="lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color }}>
            {anyFilter ? "Matching your filters" : filters.fiscalYear ? `FY${filters.fiscalYear} payments to vendors` : "All payments to vendors"}
          </p>
          <p className="font-bold tabular-nums tracking-tight text-gray-900 text-6xl sm:text-7xl" style={{ fontFamily: "var(--font-display)" }}>
            {abbreviateCurrency(data.sum)}
          </p>
          <p className="mt-3 text-gray-600 text-base">
            <span className="tabular-nums font-semibold text-gray-900">{data.total.toLocaleString()}</span> payments to{" "}
            <span className="tabular-nums font-semibold text-gray-900">{data.vendorCount.toLocaleString()}</span>{" "}
            {data.vendorCount === 1 ? "vendor" : "vendors"}
            <span className="text-gray-400"> · net of credits</span>
          </p>
        </div>
        <div className="text-sm text-gray-500 lg:text-right space-y-1">
          {overview.dataThrough && <p>Invoices through <span className="font-semibold text-gray-700">{fmtDate(overview.dataThrough)}</span></p>}
          <a
            href={`/api/public/checkbook/${townSlug}/export?${exportQs}`}
            className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ ["--tw-ring-color" as string]: color }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download CSV
          </a>
        </div>
      </section>

      {/* ── Warrant cycles ───────────────────────────────────── */}
      {data.warrants.length > 0 && (
        <section aria-labelledby="warrants-h">
          <div className="flex items-end justify-between mb-3 gap-4">
            <div>
              <h2 id="warrants-h" className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
                Payments by warrant cycle
              </h2>
              <p className="text-sm text-gray-500">A warrant is the official list of bills approved for payment. Select a cycle to see what was paid.</p>
            </div>
            {filters.warrant && (
              <button onClick={() => update({ warrant: undefined })} className="text-sm font-semibold underline shrink-0" style={{ color }}>
                Show all cycles
              </button>
            )}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2" role="group" aria-label="Warrant cycles">
            {data.warrants.map((w: WarrantSummary) => {
              const value = w.warrant || NONE;
              const active = filters.warrant === value;
              const h = Math.max(6, Math.round((Math.abs(w.total) / maxWarrant) * 72));
              return (
                <button
                  key={`${w.fiscalYear}-${value}`}
                  onClick={() => update({ warrant: active ? undefined : value })}
                  aria-pressed={active}
                  className="shrink-0 text-left rounded-xl border bg-white px-4 pt-3 pb-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2"
                  style={{ minWidth: 132, borderColor: active ? color : "#e5e7eb", boxShadow: active ? `0 0 0 1px ${color}` : undefined, ["--tw-ring-color" as string]: color }}
                >
                  <div className="flex items-end" style={{ height: 76 }} aria-hidden="true">
                    <div className="w-full rounded-t" style={{ height: h, backgroundColor: color, opacity: active ? 1 : 0.55 }} />
                  </div>
                  <p className="mt-2 text-sm font-bold text-gray-900">{warrantLabel(w.warrant)}</p>
                  <p className="text-sm tabular-nums font-semibold" style={{ color }}>{abbreviateCurrency(w.total)}</p>
                  <p className="text-xs text-gray-500 tabular-nums">{w.count.toLocaleString()} payments</p>
                  {w.firstDate && <p className="text-xs text-gray-400">{dateRange(w.firstDate, w.lastDate)}</p>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Search & filters ─────────────────────────────────── */}
      <section aria-label="Search and filters" className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4">
        <div className="relative">
          <label htmlFor="cb-search" className="sr-only">Search vendors and descriptions</label>
          <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            id="cb-search" type="search" value={qInput} onChange={e => setQInput(e.target.value)}
            placeholder="Search by vendor, description, or department…"
            className="w-full pl-10 pr-3 py-3 text-base border border-gray-300 rounded-xl focus:outline-none focus:ring-2"
            style={{ ["--tw-ring-color" as string]: color }}
          />
        </div>
        <div className={`grid grid-cols-2 ${overview.functionAreas.length ? "lg:grid-cols-6" : "lg:grid-cols-5"} gap-3`}>
          <Field label="Fiscal year">
            <select value={filters.fiscalYear ?? "all"} onChange={e => update({ fiscalYear: e.target.value === "all" ? undefined : e.target.value, warrant: undefined })} className="cb-input">
              <option value="all">All years</option>
              {overview.fiscalYears.map(y => <option key={y} value={y}>FY{y}</option>)}
            </select>
          </Field>
          {overview.functionAreas.length > 0 && (
            <Field label="Function">
              <select value={filters.functionArea ?? ""} onChange={e => update({ functionArea: e.target.value || undefined })} className="cb-input">
                <option value="">All functions</option>
                {overview.functionAreas.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
          )}
          <Field label="Department">
            <select value={filters.department ?? ""} onChange={e => update({ department: e.target.value || undefined })} className="cb-input">
              <option value="">All departments</option>
              {overview.departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select value={filters.category ?? ""} onChange={e => update({ category: e.target.value || undefined })} className="cb-input">
              <option value="">All categories</option>
              {overview.categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Min amount">
            <input inputMode="decimal" value={minInput} onChange={e => setMinInput(e.target.value.replace(/[^0-9.\-]/g, ""))} placeholder="$0" className="cb-input" />
          </Field>
          <Field label="Max amount">
            <input inputMode="decimal" value={maxInput} onChange={e => setMaxInput(e.target.value.replace(/[^0-9.\-]/g, ""))} placeholder="No limit" className="cb-input" />
          </Field>
        </div>
        {(anyFilter) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Filtering by</span>
            {filters.warrant && <Chip onRemove={() => update({ warrant: undefined })}>{warrantLabel(filters.warrant === NONE ? "" : filters.warrant)}</Chip>}
            {vendorLabel && <Chip onRemove={() => update({ vendorId: undefined })}>{vendorLabel}</Chip>}
            {filters.functionArea && <Chip onRemove={() => update({ functionArea: undefined })}>{filters.functionArea}</Chip>}
            {filters.department && <Chip onRemove={() => update({ department: undefined })}>{filters.department}</Chip>}
            {filters.category && <Chip onRemove={() => update({ category: undefined })}>{filters.category}</Chip>}
            {filters.q && <Chip onRemove={() => setQInput("")}>“{filters.q}”</Chip>}
            <button onClick={reset} className="text-sm font-semibold underline ml-1" style={{ color }}>Clear all</button>
          </div>
        )}
        <style>{`.cb-input{width:100%;padding:0.55rem 0.7rem;border:1px solid #d1d5db;border-radius:0.6rem;background:#fff;font-size:0.9rem}.cb-input:focus{outline:2px solid ${color};outline-offset:1px}`}</style>
      </section>

      {/* ── Where the money went ─────────────────────────────── */}
      {data.total > 0 && !filters.vendorId && (
        <section aria-label="Largest vendors and departments" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <RankedList title="Largest vendors" subtitle="Select a vendor to see every payment" items={data.topVendors.slice(0, 8)} color={color}
            onPick={i => { update({ vendorId: i.id }); }} />
          {data.byFunction.length > 0 && !filters.functionArea ? (
            <RankedList title="Spending by function" subtitle="Select an area to filter" items={data.byFunction.slice(0, 8)} color={color}
              onPick={i => update({ functionArea: i.id })} />
          ) : (
            <RankedList title="Spending by department" subtitle="Select a department to filter" items={data.byDepartment.slice(0, 8)} color={color}
              onPick={i => update({ department: i.id })} />
          )}
        </section>
      )}

      {/* ── Payments table ───────────────────────────────────── */}
      <section aria-label="Payments" className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>All payments</h2>
          <p className="text-sm text-gray-500 tabular-nums" aria-live="polite">
            {error ? "Couldn’t load results — please try again." : data.total === 0 ? "No matching payments" : `Showing ${firstShown.toLocaleString()}–${lastShown.toLocaleString()} of ${data.total.toLocaleString()}`}
          </p>
        </div>

        {data.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <p className="font-semibold text-gray-700">No payments match these filters.</p>
            <button onClick={reset} className="mt-2 text-sm font-semibold underline" style={{ color }}>Clear all filters</button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-2xl border border-gray-200 bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Vendor payments</caption>
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <SortTh label="Date" col="date" filters={filters} onSort={toggleSort} />
                    <SortTh label="Vendor" col="vendor" filters={filters} onSort={toggleSort} />
                    <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Description</th>
                    <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Department</th>
                    <th scope="col" className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">Warrant</th>
                    <SortTh label="Amount" col="amount" align="right" filters={filters} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(r => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600 tabular-nums">{fmtDate(r.date)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => update({ vendorId: r.vendorId })} className="text-left font-semibold text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 rounded" style={{ ["--tw-ring-color" as string]: color }}>
                          {r.vendor}
                        </button>
                        {r.category && <p className="text-xs text-gray-500 mt-0.5">{r.category}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{r.memo ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600">{r.department ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 text-gray-700 tabular-nums">{r.warrant || "Direct"}</span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-semibold" style={{ color: r.amount < 0 ? "#047857" : "#111827" }}>
                        {r.amount < 0 ? `(${formatCurrency(Math.abs(r.amount))})` : formatCurrency(r.amount)}
                        {r.amount < 0 && <span className="block text-xs font-normal text-emerald-700">credit</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden space-y-3">
              {data.rows.map(r => (
                <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => update({ vendorId: r.vendorId })} className="text-left font-semibold text-gray-900">{r.vendor}</button>
                    <span className="tabular-nums font-bold shrink-0" style={{ color: r.amount < 0 ? "#047857" : "#111827" }}>
                      {r.amount < 0 ? `(${formatCurrency(Math.abs(r.amount))})` : formatCurrency(r.amount)}
                    </span>
                  </div>
                  {r.memo && <p className="text-sm text-gray-700 mt-1">{r.memo}</p>}
                  <p className="text-xs text-gray-500 mt-2">
                    {fmtDate(r.date)} · {r.department ?? r.category ?? "—"} · {r.warrant ? `Warrant ${r.warrant}` : "Direct pay"}
                  </p>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <nav className="flex items-center justify-between mt-4" aria-label="Pagination">
                <button disabled={data.page <= 1} onClick={() => setFilters(p => ({ ...p, page: Math.max(1, (p.page ?? 1) - 1) }))}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium disabled:opacity-40 hover:bg-gray-50">← Previous</button>
                <span className="text-sm text-gray-500 tabular-nums">Page {data.page} of {totalPages}</span>
                <button disabled={data.page >= totalPages} onClick={() => setFilters(p => ({ ...p, page: (p.page ?? 1) + 1 }))}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium disabled:opacity-40 hover:bg-gray-50">Next →</button>
              </nav>
            )}
          </>
        )}
      </section>

      {/* ── About this data ──────────────────────────────────── */}
      <section aria-labelledby="about-h" className="rounded-2xl border border-gray-200 bg-white/60 px-6 py-6">
        <h2 id="about-h" className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">About this data</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-600 leading-relaxed">
          <div>
            <p className="font-semibold text-gray-800 mb-1">Where it comes from</p>
            <p>Each line is a payment recorded in the Town’s accounting system and published in a regular warrant cycle. Dates shown are invoice dates, and figures may be updated as records are corrected.</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">Protecting privacy</p>
            <p>Payments to individuals, such as refunds to taxpayers, are shown without names. Descriptions are screened for personal information, and anything uncertain is reviewed by staff before it appears.{overview.excludedCount > 0 && ` ${overview.excludedCount.toLocaleString()} confidential payments are withheld entirely.`}</p>
          </div>
          <div>
            <p className="font-semibold text-gray-800 mb-1">Reading the amounts</p>
            <p>Credits and returns from vendors appear in parentheses and reduce totals. Totals shown are net of credits.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── small pieces ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-gray-100 text-sm text-gray-800">
      {children}
      <button onClick={onRemove} aria-label="Remove filter" className="w-5 h-5 rounded-full hover:bg-gray-200 text-gray-500 leading-none">×</button>
    </span>
  );
}

function SortTh({ label, col, align, filters, onSort }: {
  label: string; col: "date" | "vendor" | "amount"; align?: "right";
  filters: CheckbookFilters; onSort: (c: "date" | "vendor" | "amount") => void;
}) {
  const active = (filters.sort ?? "date") === col;
  return (
    <th scope="col" aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 ${align === "right" ? "text-right" : ""}`}>
      <button onClick={() => onSort(col)} className={`text-xs font-bold uppercase tracking-wider hover:text-gray-900 ${active ? "text-gray-900" : "text-gray-500"}`}>
        {label} <span aria-hidden="true">{active ? (filters.dir === "asc" ? "↑" : "↓") : ""}</span>
      </button>
    </th>
  );
}

function RankedList({ title, subtitle, items, color, onPick }: {
  title: string; subtitle: string; items: RankedItem[]; color: string; onPick: (i: RankedItem) => void;
}) {
  const max = Math.max(1, ...items.map(i => Math.abs(i.total)));
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>{title}</h2>
      <p className="text-sm text-gray-500 mb-4">{subtitle}</p>
      <ol className="space-y-1">
        {items.map((i, idx) => (
          <li key={i.id}>
            <button onClick={() => onPick(i)} className="w-full text-left rounded-lg px-2 py-2 hover:bg-white focus-visible:outline-none focus-visible:ring-2" style={{ ["--tw-ring-color" as string]: color }}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-gray-800 truncate"><span className="text-gray-300 tabular-nums mr-2">{idx + 1}</span>{i.label}</span>
                <span className="text-sm font-bold tabular-nums text-gray-900 shrink-0">{abbreviateCurrency(i.total)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, (Math.abs(i.total) / max) * 100)}%`, backgroundColor: color, opacity: 0.8 }} />
              </div>
              <p className="text-xs text-gray-400 mt-0.5 tabular-nums">{i.count.toLocaleString()} payment{i.count === 1 ? "" : "s"}</p>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
