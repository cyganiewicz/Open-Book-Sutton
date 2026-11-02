"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import type { CapitalOverview } from "@/lib/capital/admin";
import type { ProjectRow } from "@/lib/capital/projects";
import { priorityShort } from "@/lib/capital/constants";
import { ApiError, Meter, ProjectStatusPill, StatusPill, fy, inputCls, money, moneyShort, postJson } from "./parts";

type Stage = "all" | "review" | "recommended" | "funded" | "drafts" | "deferred";
type Group = "dept" | "year" | "none";
interface Entry { row: ProjectRow; key: string; groupLabel: string; amount: number; note: string }

const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Every project" },
  { key: "review", label: "To review", hint: "Submitted by departments and waiting for you" },
  { key: "recommended", label: "Recommended", hint: "Recommended and locked for departments" },
  { key: "funded", label: "Funded", hint: "Approved in a capital budget" },
  { key: "drafts", label: "Drafts", hint: "Still being prepared by departments, including carried-over requests" },
  { key: "deferred", label: "Deferred", hint: "Set aside, or withdrawn" },
];
const stageOf = (r: ProjectRow): Exclude<Stage, "all"> =>
  r.requestStatus === "approved" ? "funded"
  : ["submitted", "under_review"].includes(r.requestStatus) ? "review"
  : r.requestStatus === "recommended" ? "recommended"
  : ["deferred", "withdrawn"].includes(r.requestStatus) ? "deferred" : "drafts";

export default function AdminProjectList({ rows, ov, reload }: { rows: ProjectRow[]; ov: CapitalOverview; reload: () => Promise<void> }) {
  const adopted = ov.settings.adoptedFY;
  const counts = useMemo(() => {
    const c: Record<Stage, number> = { all: rows.length, review: 0, recommended: 0, funded: 0, drafts: 0, deferred: 0 };
    for (const r of rows) c[stageOf(r)]++;
    return c;
  }, [rows]);

  const [stage, setStage] = useState<Stage>(counts.review > 0 ? "review" : "all");
  const [group, setGroup] = useState<Group>("dept");
  const [q, setQ] = useState(""); const [dept, setDept] = useState(""); const [sort, setSort] = useState("code");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const entries = useMemo<Entry[]>(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter(r => (stage === "all" || stageOf(r) === stage) && (!dept || r.departmentId === dept) && (!needle || `${r.title} ${r.code}`.toLowerCase().includes(needle)));
    const out: Entry[] = [];
    for (const r of list) {
      const approved = r.years.filter(y => y.approvedAmount !== null).sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear));
      if (r.requestStatus === "approved" && approved.length) {
        if (group === "year") for (const y of approved) out.push({ row: r, key: y.fiscalYear, groupLabel: fy(y.fiscalYear), amount: y.approvedAmount ?? 0, note: `${fy(y.fiscalYear)} funded` });
        else out.push({ row: r, key: r.departmentId, groupLabel: r.departmentName, amount: approved[0].approvedAmount ?? 0, note: `${fy(approved[0].fiscalYear)} funded` });
      } else {
        const planned = r.years.filter(y => y.fiscalYear > adopted).map(y => ({ fy: y.fiscalYear, a: y.recommendedAmount ?? y.requestedAmount })).filter(y => y.a > 0);
        const range = planned.length === 0 ? "No year requested" : planned.length === 1 ? fy(planned[0].fy) : `${fy(planned[0].fy)}–${fy(planned[planned.length - 1].fy)}`;
        out.push({ row: r, key: group === "year" ? (planned[0]?.fy ?? "none") : r.departmentId, groupLabel: group === "year" ? (planned[0] ? `First requested ${fy(planned[0].fy)}` : "No year entered yet") : r.departmentName, amount: planned.reduce((s, y) => s + y.a, 0), note: range });
      }
    }
    return out;
  }, [rows, stage, dept, q, group, adopted]);

  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: string; items: Entry[] }>();
    for (const e of entries) {
      const k = group === "none" ? "all" : e.key;
      const g = m.get(k) ?? { key: k, label: group === "none" ? "All projects" : e.groupLabel, items: [] };
      g.items.push(e); m.set(k, g);
    }
    const sorters: Record<string, (a: Entry, b: Entry) => number> = {
      code: (a, b) => a.row.code.localeCompare(b.row.code), score: (a, b) => (b.row.composite ?? -1) - (a.row.composite ?? -1),
      total: (a, b) => b.amount - a.amount, ready: (a, b) => a.row.readiness - b.row.readiness,
    };
    const arr = [...m.values()];
    arr.forEach(g => g.items.sort(sorters[sort] ?? sorters.code));
    return arr.sort((a, b) => group === "year" ? (stage === "funded" ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)) : a.label.localeCompare(b.label));
  }, [entries, group, sort, stage]);

  const defaultOpen = !!q || entries.length <= 24 || groups.length === 1;
  const gkey = (k: string) => `${stage}|${group}|${k}`;
  const isOpen = (k: string) => openMap[gkey(k)] ?? defaultOpen;
  const setAll = (v: boolean) => setOpenMap(Object.fromEntries(groups.map(g => [gkey(g.key), v])));
  const toggleRow = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const years = ov.planYears;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap" role="tablist" aria-label="Project stage">
        {STAGES.map(s => (
          <button key={s.key} role="tab" aria-selected={stage === s.key} title={s.hint} onClick={() => setStage(s.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${stage === s.key ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {s.label} <span className={`tabular-nums ${s.key === "review" && counts.review > 0 && stage !== "review" ? "text-amber-600 font-semibold" : "text-gray-400"}`}>{counts[s.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div><label htmlFor="pq" className="block text-xs font-medium text-gray-500">Search</label><input id="pq" value={q} onChange={e => setQ(e.target.value)} placeholder="Title or code" className={inputCls + " w-52"} /></div>
        <div><label htmlFor="pd" className="block text-xs font-medium text-gray-500">Department</label><select id="pd" value={dept} onChange={e => setDept(e.target.value)} className={inputCls}><option value="">All departments</option>{ov.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div><label htmlFor="pg" className="block text-xs font-medium text-gray-500">Group by</label><select id="pg" value={group} onChange={e => setGroup(e.target.value as Group)} className={inputCls}><option value="dept">Department</option><option value="year">Fiscal year</option><option value="none">Nothing (one list)</option></select></div>
        <div><label htmlFor="so" className="block text-xs font-medium text-gray-500">Sort by</label><select id="so" value={sort} onChange={e => setSort(e.target.value)} className={inputCls}><option value="code">Project number</option><option value="score">Highest score</option><option value="total">Largest amount</option><option value="ready">Least complete</option></select></div>
        <div className="flex-1" />
        {groups.length > 1 && <div className="flex gap-3 pb-2 text-sm"><button onClick={() => setAll(true)} className="text-blue-600 hover:underline">Expand all</button><button onClick={() => setAll(false)} className="text-blue-600 hover:underline">Collapse all</button></div>}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
        <span>Showing {entries.length === rows.length ? `all ${rows.length}` : `${new Set(entries.map(e => e.row.id)).size} of ${rows.length}`} projects{stage !== "all" ? ` · ${STAGES.find(s => s.key === stage)!.hint.toLowerCase()}` : ""}</span>
        <span className="flex-1" />
        <button onClick={async () => { if (!confirm("Make every submitted, under-review and recommended request visible on the public site?")) return; try { const r = await postJson<{ count: number }>("/api/capital/admin", { action: "bulkPublish", statuses: ["submitted", "under_review", "recommended"], isPublic: true }); setNote(`${r.count} requests are now public.`); await reload(); } catch (e) { setNote(e instanceof ApiError ? e.message : "Failed"); } }}
          className="text-xs text-gray-500 hover:text-gray-800 underline">Publish pending requests…</button>
      </div>
      {note && <p role="status" className="text-sm text-emerald-800">{note}</p>}

      {groups.length === 0 && <p className="text-sm text-gray-600 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-10 text-center">{stage === "review" ? "Nothing is waiting for your review." : "No projects match."}</p>}

      {groups.map(g => {
        const total = g.items.reduce((s, e) => s + e.amount, 0);
        const toReview = g.items.filter(e => stageOf(e.row) === "review").length;
        const open = isOpen(g.key);
        return (
          <section key={g.key} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <button type="button" aria-expanded={open} onClick={() => setOpenMap(m => ({ ...m, [gkey(g.key)]: !open }))} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-left hover:bg-gray-50">
              <span aria-hidden="true" className="text-gray-400 text-xs" style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none" }}>▶</span>
              <span className="font-semibold text-gray-900">{g.label}</span>
              <span className="text-sm text-gray-500">{g.items.length} project{g.items.length === 1 ? "" : "s"}</span>
              {toReview > 0 && stage !== "review" && <span className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">{toReview} to review</span>}
              <span className="flex-1" />
              <span className="font-semibold tabular-nums text-gray-800">{money(total)}</span>
            </button>
            {open && (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-2 font-semibold">Project</th><th className="px-2 py-2 font-semibold">Status</th><th className="px-2 py-2 font-semibold hidden md:table-cell">Priority</th>
                    <th className="px-2 py-2 font-semibold text-right">Amount</th><th className="px-2 py-2 font-semibold w-24 hidden md:table-cell">Complete</th><th className="px-5 py-2 font-semibold text-right">Score</th>
                  </tr></thead>
                  <tbody>
                    {g.items.map(e => {
                      const r = e.row; const rid = `${r.id}|${e.key}`; const isExp = expanded.has(rid);
                      return (
                        <Fragment key={rid}>
                          <tr className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-5 py-2.5">
                              <div className="flex items-start gap-2">
                                <button type="button" aria-expanded={isExp} aria-label={`${isExp ? "Hide" : "Show"} year-by-year amounts for ${r.title}`} onClick={() => toggleRow(rid)} className="mt-0.5 text-gray-400 hover:text-gray-700 text-xs w-4" style={{ transform: isExp ? "rotate(90deg)" : "none" }}>▶</button>
                                <div className="min-w-0"><Link href={`/admin/capital/${r.id}`} className="font-medium text-gray-900 hover:underline">{r.title}</Link>
                                  <p className="text-xs text-gray-400"><span className="font-mono">{r.code}</span>{group !== "dept" && ` · ${r.departmentName}`}{r.openChangeRequests > 0 && <span className="ml-2 text-blue-700 font-medium">● change request</span>}{r.carriedForward && <span className="ml-2 text-blue-600">carried over</span>}{r.isPublic && <span className="ml-2">· public</span>}</p></div>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 whitespace-nowrap"><StatusPill status={r.requestStatus} />{r.requestStatus === "approved" && r.projectStatus !== "unreported" && r.projectStatus !== "not_started" && <div className="mt-1"><ProjectStatusPill status={r.projectStatus} /></div>}</td>
                            <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap hidden md:table-cell">{priorityShort(r.priority)}</td>
                            <td className="px-2 py-2.5 text-right whitespace-nowrap"><span className={`tabular-nums font-semibold ${r.requestStatus === "approved" ? "text-emerald-800" : "text-gray-900"}`}>{e.amount ? moneyShort(e.amount) : "—"}</span><p className="text-xs text-gray-400">{e.note}</p></td>
                            <td className="px-2 py-2.5 hidden md:table-cell"><Meter value={r.readiness} label="Completeness" /><span className="text-xs text-gray-400 tabular-nums">{r.readiness}%</span></td>
                            <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{r.composite ?? "—"}</td>
                          </tr>
                          {isExp && (
                            <tr className="bg-gray-50/70"><td colSpan={6} className="px-5 py-3">
                              <div className="flex flex-wrap gap-2">
                                {years.map(y => { const v = r.years.find(x => x.fiscalYear === y); const appr = v?.approvedAmount ?? null; const amt = appr ?? v?.recommendedAmount ?? v?.requestedAmount ?? 0;
                                  return <div key={y} className={`rounded-lg border px-3 py-1.5 min-w-24 ${appr !== null ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
                                    <p className="text-xs text-gray-500">{fy(y)}</p><p className={`tabular-nums text-sm font-semibold ${amt ? "text-gray-900" : "text-gray-300"}`}>{amt ? money(amt) : "—"}</p>
                                    <p className="text-[11px] text-gray-400">{appr !== null ? "funded" : v?.recommendedAmount != null ? "recommended" : amt ? "requested" : ""}</p></div>; })}
                                <div className="flex-1" />
                                <Link href={`/admin/capital/${r.id}`} className="self-center text-sm font-medium text-blue-600 hover:underline">Open project →</Link>
                              </div>
                              <p className="text-xs text-gray-500 mt-2">{r.departmentName}{r.category ? ` · ${r.category}` : ""}</p>
                            </td></tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
