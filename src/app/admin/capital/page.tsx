"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import HelpBox from "@/components/admin/HelpBox";
import type { CapitalOverview } from "@/lib/capital/admin";
import type { ProjectRow } from "@/lib/capital/projects";
import { CRITERIA, REQUEST_STATUSES, priorityShort } from "@/lib/capital/constants";
import { ApiError, ErrorBox, Meter, ProjectStatusPill, StatusPill, api, fy, inputCls, money, moneyShort, postJson } from "@/components/capital/parts";

type Tab = "projects" | "analysis" | "setup";

export default function AdminCapitalPage() {
  const [ov, setOv] = useState<CapitalOverview | null>(null);
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [tab, setTab] = useState<Tab>("projects");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([api<CapitalOverview>("/api/capital/admin"), api<{ rows: ProjectRow[] }>("/api/capital/projects")]);
      setOv(o); setRows(p.rows); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox message={error} />;
  if (!ov) return <p className="text-gray-500 py-10 text-center">Loading…</p>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Capital Improvement Program</h1>
          <p className="text-gray-500 mt-1 text-sm">FY{ov.planYears[1]}–FY{ov.planYears[ov.planYears.length - 1]} planning cycle, with FY{ov.settings.adoptedFY} adopted. Departments request, you review and fund, residents follow the work.</p>
        </div>
        <Link href="/admin/capital/new" className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800">+ New project</Link>
      </div>

      {ov.seed.remaining > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center gap-3">
          <span><strong>{ov.seed.remaining} projects from the FY2027 plan and requests haven’t been imported yet.</strong></span>
          <button onClick={() => setTab("setup")} className="underline font-medium">Go to import</button>
        </div>
      )}
      {ov.openChangeRequests > 0 && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><strong>{ov.openChangeRequests} change request{ov.openChangeRequests === 1 ? "" : "s"}</strong> from departments are waiting on funded projects.</div>}

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit" role="tablist">
        {([["projects", `Projects (${rows.length})`], ["analysis", "Analysis"], ["setup", "Setup"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-md text-sm font-medium ${tab === k ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>{label}</button>
        ))}
      </div>

      {tab === "projects" && <ProjectsTab rows={rows} ov={ov} reload={load} />}
      {tab === "analysis" && <AnalysisTab ov={ov} />}
      {tab === "setup" && <SetupTab ov={ov} reload={load} />}
    </div>
  );
}

// ── Projects ─────────────────────────────────────────────────────────────────

function ProjectsTab({ rows, ov, reload }: { rows: ProjectRow[]; ov: CapitalOverview; reload: () => Promise<void> }) {
  const [q, setQ] = useState(""); const [dept, setDept] = useState(""); const [status, setStatus] = useState(""); const [sort, setSort] = useState("code"); const [fundedYr, setFundedYr] = useState("");
  const fundedYears = useMemo(() => [...new Set(rows.flatMap(r => r.years.filter(y => y.approvedAmount !== null).map(y => y.fiscalYear)))].sort().reverse(), [rows]);
  const [note, setNote] = useState("");
  const years = ov.planYears;
  const amt = (r: ProjectRow, y: string) => { const v = r.years.find(x => x.fiscalYear === y); return v ? (v.approvedAmount ?? v.recommendedAmount ?? v.requestedAmount) : 0; };
  const total = (r: ProjectRow) => years.reduce((s, y) => s + amt(r, y), 0);
  const list = useMemo(() => {
    let l = rows.filter(r => (!q || (r.title + r.code).toLowerCase().includes(q.toLowerCase())) && (!dept || r.departmentId === dept) && (!status || r.requestStatus === status) && (!fundedYr || r.years.some(y => y.fiscalYear === fundedYr && y.approvedAmount !== null)));
    l = [...l].sort((a, b) => sort === "score" ? (b.composite ?? -1) - (a.composite ?? -1) : sort === "total" ? total(b) - total(a) : sort === "ready" ? a.readiness - b.readiness : a.code.localeCompare(b.code));
    return l;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, dept, status, sort, fundedYr]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div><label htmlFor="pq" className="block text-xs font-medium text-gray-500">Search</label><input id="pq" value={q} onChange={e => setQ(e.target.value)} placeholder="Title or code" className={inputCls + " w-56"} /></div>
        <div><label htmlFor="pd" className="block text-xs font-medium text-gray-500">Department</label><select id="pd" value={dept} onChange={e => setDept(e.target.value)} className={inputCls}><option value="">All</option>{ov.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div><label htmlFor="ps" className="block text-xs font-medium text-gray-500">Status</label><select id="ps" value={status} onChange={e => setStatus(e.target.value)} className={inputCls}><option value="">All</option>{REQUEST_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
        <div><label htmlFor="fy" className="block text-xs font-medium text-gray-500">Funded in</label><select id="fy" value={fundedYr} onChange={e => setFundedYr(e.target.value)} className={inputCls}><option value="">Any year</option>{fundedYears.map(y => <option key={y} value={y}>{fy(y)}</option>)}</select></div>
        <div><label htmlFor="so" className="block text-xs font-medium text-gray-500">Sort by</label><select id="so" value={sort} onChange={e => setSort(e.target.value)} className={inputCls}><option value="code">Project number</option><option value="score">Highest score</option><option value="total">Largest total</option><option value="ready">Least complete</option></select></div>
        <div className="flex-1" />
        <button onClick={async () => { if (!confirm("Make every submitted, under-review and recommended request visible on the public site?")) return; try { const r = await postJson<{ count: number }>("/api/capital/admin", { action: "bulkPublish", statuses: ["submitted", "under_review", "recommended"], isPublic: true }); setNote(`${r.count} requests are now public.`); await reload(); } catch (e) { setNote(e instanceof ApiError ? e.message : "Failed"); } }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50">Publish all pending requests</button>
      </div>
      {note && <p role="status" className="text-sm text-emerald-800">{note}</p>}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
            <th className="px-4 py-2 font-semibold">Project</th><th className="px-2 py-2 font-semibold">Status</th><th className="px-2 py-2 font-semibold">Priority</th>
            {years.map(y => <th key={y} className="px-2 py-2 font-semibold text-right">{fy(y)}</th>)}
            <th className="px-2 py-2 font-semibold w-24">Complete</th><th className="px-2 py-2 font-semibold text-right">Score</th>
          </tr></thead>
          <tbody>
            {list.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5"><Link href={`/admin/capital/${r.id}`} className="font-medium text-gray-900 hover:underline">{r.title}</Link>
                  <p className="text-xs text-gray-400"><span className="font-mono">{r.code}</span> · {r.departmentName}{r.openChangeRequests > 0 && <span className="ml-2 text-blue-700 font-medium">● change request</span>}{r.isPublic && <span className="ml-2 text-gray-400">· public</span>}</p></td>
                <td className="px-2 py-2.5 whitespace-nowrap"><StatusPill status={r.requestStatus} />{r.requestStatus === "approved" && <div className="mt-1"><ProjectStatusPill status={r.projectStatus} /></div>}</td>
                <td className="px-2 py-2.5 text-gray-600 whitespace-nowrap">{priorityShort(r.priority)}</td>
                {years.map(y => { const a = amt(r, y); const appr = r.years.find(v => v.fiscalYear === y)?.approvedAmount != null; return <td key={y} className={`px-2 py-2.5 text-right tabular-nums ${appr ? "font-semibold text-emerald-800" : a ? "text-gray-800" : "text-gray-300"}`}>{a ? moneyShort(a) : "—"}</td>; })}
                <td className="px-2 py-2.5"><Meter value={r.readiness} label="Completeness" /><span className="text-xs text-gray-400 tabular-nums">{r.readiness}%</span></td>
                <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{r.composite ?? "—"}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={years.length + 5} className="px-4 py-10 text-center text-gray-500">No projects match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Amounts show the funded amount if approved, otherwise the recommended amount, otherwise the request. Green = funded.</p>
    </div>
  );
}

// ── Analysis ─────────────────────────────────────────────────────────────────

function AnalysisTab({ ov }: { ov: CapitalOverview }) {
  const a = ov.analysis;
  const maxPlanned = Math.max(1, ...a.years.map(y => Math.max(y.planned, y.capacity ?? 0)));
  const Card = ({ title, children, tone = "gray" }: { title: string; children: React.ReactNode; tone?: string }) => (
    <div className={`rounded-2xl border p-5 space-y-2 ${tone === "red" ? "bg-red-50 border-red-200" : tone === "amber" ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}><h3 className="font-semibold text-gray-900">{title}</h3>{children}</div>
  );
  const w = a.watch;
  return (
    <div className="space-y-6">
      <HelpBox title="How to read this" variant="info">
        <p>The “plan” for each year uses the funded amount if approved, otherwise your recommended amount, otherwise the department’s request, and ignores withdrawn and not-funded requests. Enter the funding the Town expects to be able to commit each year under <strong>Setup → Capacity</strong> to see where requests exceed what’s affordable. This follows GFOA guidance to match a multi-year plan to realistic funding and debt capacity.</p>
      </HelpBox>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
            <th className="px-4 py-2">Year</th><th className="px-2 py-2 text-right">Requested</th><th className="px-2 py-2 text-right">Recommended</th><th className="px-2 py-2 text-right">Funded</th>
            <th className="px-2 py-2 text-right">Plan</th><th className="px-2 py-2 text-right">Capacity</th><th className="px-2 py-2 text-right">Over / under</th><th className="px-4 py-2 w-48">Plan vs capacity</th>
          </tr></thead>
          <tbody>
            {a.years.map(y => (
              <tr key={y.fiscalYear} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-medium">{fy(y.fiscalYear)} <span className="text-xs text-gray-400">({y.projectCount} projects)</span></td>
                <td className="px-2 py-2.5 text-right tabular-nums">{money(y.requested)}</td><td className="px-2 py-2.5 text-right tabular-nums text-violet-700">{y.recommended ? money(y.recommended) : "—"}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-emerald-800 font-medium">{y.approved ? money(y.approved) : "—"}</td>
                <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{money(y.planned)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{y.capacity === null ? <span className="text-gray-300">not set</span> : money(y.capacity)}</td>
                <td className={`px-2 py-2.5 text-right tabular-nums font-medium ${y.gap === null ? "text-gray-300" : y.gap < 0 ? "text-red-600" : "text-emerald-700"}`}>{y.gap === null ? "—" : y.gap < 0 ? `${money(-y.gap)} over` : `${money(y.gap)} room`}</td>
                <td className="px-4 py-2.5">
                  <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden" aria-hidden="true">
                    <div className={`absolute inset-y-0 left-0 ${y.gap !== null && y.gap < 0 ? "bg-red-400" : "bg-emerald-600"}`} style={{ width: `${(y.planned / maxPlanned) * 100}%` }} />
                    {y.capacity !== null && <div className="absolute inset-y-0 w-0.5 bg-gray-900" style={{ left: `${(y.capacity / maxPlanned) * 100}%` }} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Years over capacity" tone={w.overCapacity.length ? "red" : "gray"}>
          {w.overCapacity.length === 0 ? <p className="text-sm text-gray-600">None (or capacity hasn’t been entered yet).</p> : <ul className="text-sm space-y-1">{w.overCapacity.map(o => <li key={o.fiscalYear}><strong>{fy(o.fiscalYear)}</strong>: plan {money(o.planned)} vs capacity {money(o.capacity)} — <span className="text-red-700 font-medium">{money(o.over)} over</span></li>)}</ul>}
        </Card>
        <Card title="Major projects (≥ $1M)" tone={w.major.length ? "amber" : "gray"}>
          {w.major.length === 0 ? <p className="text-sm text-gray-600">None.</p> : <><ul className="text-sm space-y-1">{w.major.map(m => <li key={m.id + m.fiscalYear}><Link className="text-blue-700 hover:underline" href={`/admin/capital/${m.id}`}>{m.title}</Link> — {fy(m.fiscalYear)}, <strong>{money(m.amount)}</strong></li>)}</ul><p className="text-xs text-gray-600">These typically need borrowing and voter approval, and affect debt capacity for years. Confirm the authorization path with Town Counsel and your financial advisor.</p></>}
        </Card>
        <Card title="Critical or high-priority, not yet funded">
          {w.criticalPushedOut.length === 0 ? <p className="text-sm text-gray-600">None are pushed beyond the next two years.</p> : <ul className="text-sm space-y-1">{w.criticalPushedOut.map(c => <li key={c.id}><Link className="text-blue-700 hover:underline" href={`/admin/capital/${c.id}`}>{c.title}</Link> <span className="text-gray-500">({c.department}) {c.firstYear ? `first requested ${fy(c.firstYear)}` : "no year with funding requested"}</span></li>)}</ul>}
        </Card>
        <Card title={`Not ready for FY${ov.planYears[1]}`}>
          {w.lowReadinessNextYear.length === 0 ? <p className="text-sm text-gray-600">Every FY{ov.planYears[1]} request is reasonably complete.</p> : <><ul className="text-sm space-y-1">{w.lowReadinessNextYear.slice(0, 8).map(c => <li key={c.id}><Link className="text-blue-700 hover:underline" href={`/admin/capital/${c.id}`}>{c.title}</Link> — {money(c.amount)} <span className="text-red-600">({c.readiness}% complete)</span></li>)}</ul><p className="text-xs text-gray-600">Requests due soon with weak documentation (no quote, cost basis or questionnaire) are the riskiest to fund.</p></>}
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="By priority category">
          <table className="w-full text-sm"><tbody>{a.byPriority.map(p => <tr key={String(p.priority)} className="border-t border-gray-100"><td className="py-1.5">{p.priority ? `${p.priority}. ` : ""}{p.label}</td><td className="py-1.5 text-right tabular-nums text-gray-500">{p.count} projects</td><td className="py-1.5 text-right tabular-nums font-medium">{money(p.planned)}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Operating budget impact">
          <p className="text-2xl font-semibold tabular-nums">{a.operatingImpact.total >= 0 ? "+" : "−"}{money(Math.abs(a.operatingImpact.total))}<span className="text-sm text-gray-500 font-normal"> per year</span></p>
          <p className="text-sm text-gray-600">Net ongoing cost (or savings) of the {a.operatingImpact.counted} projects where departments estimated it. Projects with no estimate aren’t counted, so treat this as a floor.</p>
        </Card>
      </div>

      <Card title="Plan by department">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500"><th className="py-1.5 pr-3">Department</th>{ov.planYears.map(y => <th key={y} className="py-1.5 px-2 text-right">{fy(y)}</th>)}<th className="py-1.5 px-2 text-right">Total</th></tr></thead>
          <tbody>{a.byDepartment.map(d => <tr key={d.department} className="border-t border-gray-100"><td className="py-1.5 pr-3 font-medium">{d.department}</td>{ov.planYears.map(y => <td key={y} className="py-1.5 px-2 text-right tabular-nums">{d.byYear[y] ? moneyShort(d.byYear[y]) : <span className="text-gray-300">—</span>}</td>)}<td className="py-1.5 px-2 text-right tabular-nums font-semibold">{moneyShort(d.total)}</td></tr>)}</tbody>
        </table></div>
      </Card>
    </div>
  );
}

// ── Setup ────────────────────────────────────────────────────────────────────

function SetupTab({ ov, reload }: { ov: CapitalOverview; reload: () => Promise<void> }) {
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const run = async (fn: () => Promise<unknown>, ok: string) => { setErr(""); setMsg(""); try { await fn(); await reload(); setMsg(ok); } catch (e) { setErr(e instanceof ApiError ? e.message : "Something went wrong."); } };

  const s = ov.settings;
  const [adopted, setAdopted] = useState(s.adoptedFY); const [open, setOpen] = useState(s.submissionsOpen); const [emails, setEmails] = useState(s.emailsEnabled); const [note, setNote] = useState(""); const [blastMsg, setBlastMsg] = useState(""); const [deadline, setDeadline] = useState(s.submissionDeadline?.slice(0, 10) ?? "");
  const [cap, setCap] = useState<Record<string, string>>(Object.fromEntries(ov.planYears.filter(y => y > s.adoptedFY).map(y => [y, s.capacityByYear[y] ? String(s.capacityByYear[y]) : ""])));
  const [wts, setWts] = useState<Record<string, string>>(Object.fromEntries(CRITERIA.map(c => [c.key, String(s.weights[c.key] ?? c.weight)])));
  const wsum = Object.values(wts).reduce((a, b) => a + (Number(b) || 0), 0);

  const [preview, setPreview] = useState<null | { total: number; newCount: number; alreadyImported: number; newDepartments: string[]; funded: { count: number; amount: number }; requestedByYear: Record<string, number>; notFunded: number; reviewNotes: string[] }>(null);
  const [newDept, setNewDept] = useState({ name: "", code: "" });
  type Hist = { totalRows: number; create: number; addYear: number; skip: number; amount: number; byYear: { fiscalYear: string; count: number; amount: number }[]; newDepartments: string[]; errors: { row: number; reason: string }[]; warnings: string[]; sample: { fiscalYear: string; department: string; title: string; amount: number; action: string; reason: string | null }[] };
  const [hist, setHist] = useState<Hist | null>(null); const [histSource, setHistSource] = useState<"file" | "legacy">("file"); const [histFile, setHistFile] = useState<File | null>(null); const [histBusy, setHistBusy] = useState(false);
  async function sendHistory(mode: "preview" | "commit", source: "file" | "legacy") {
    setErr(""); setMsg(""); setHistBusy(true);
    try {
      const fd = new FormData(); fd.append("source", source); fd.append("mode", mode); if (source === "file" && histFile) fd.append("file", histFile);
      const res = await fetch("/api/capital/admin/history", { method: "POST", body: fd }); const data = await res.json();
      if (!res.ok) throw new ApiError(data.error || "Import failed.", data.details ?? []);
      if (mode === "preview") { setHist(data); setHistSource(source); }
      else { setHist(null); setHistFile(null); await reload(); setMsg(`Imported ${data.created} new project${data.created === 1 ? "" : "s"} and added funding to ${data.addedYears} existing project${data.addedYears === 1 ? "" : "s"}${data.departmentsCreated ? `, creating ${data.departmentsCreated} department${data.departmentsCreated === 1 ? "" : "s"}` : ""}. ${data.skipped} already recorded.`); }
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Import failed."); } finally { setHistBusy(false); }
  }

  return (
    <div className="space-y-6">
      {msg && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}
      <ErrorBox message={err} />

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Budget cycle</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><label htmlFor="afy" className="block text-sm font-medium">Adopted capital budget year</label><p className="text-xs text-gray-500 mb-1">Funded projects in this year (and earlier) are locked for departments.</p><input id="afy" value={adopted} onChange={e => setAdopted(e.target.value.replace(/\D/g, "").slice(0, 4))} className={inputCls} /></div>
          <div><label htmlFor="dl" className="block text-sm font-medium">Submission deadline (optional)</label><p className="text-xs text-gray-500 mb-1">Departments can edit through the end of this day.</p><input id="dl" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inputCls} /></div>
          <label className="flex items-center gap-2 text-sm font-medium self-end pb-2"><input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} /> Departments can edit requests</label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={emails} onChange={e => setEmails(e.target.checked)} /> Email department heads and the Town Manager&apos;s office about the capital process</label>
        </div>
        <button onClick={() => run(() => postJson("/api/capital/admin", { action: "saveSettings", adoptedFY: adopted, submissionsOpen: open, submissionDeadline: deadline || null, emailsEnabled: emails }), "Budget cycle saved.")} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold">Save</button>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div><h2 className="text-lg font-semibold">Email department heads</h2>
          <p className="text-sm text-gray-500">Automatic emails: when someone is added to a department, when a request is submitted (confirmation to them, notice to you), and when you fund, recommend or decline a request. Use the buttons below to start the cycle or nudge people. <Link href="/admin/email" className="text-blue-600 hover:underline">See what was sent</Link>.</p></div>
        <div><label htmlFor="cn" className="block text-sm font-medium">Personal note to include (optional)</label><textarea id="cn" value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} className={inputCls} placeholder="e.g. I'd like to meet with each department the week of December 1." /></div>
        {blastMsg && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{blastMsg}</p>}
        <div className="flex flex-wrap gap-3">
          <button onClick={() => { if (!confirm("Email every assigned department head that the capital cycle is open?")) return; run(async () => { const r = await postJson<{ recipients: number; sent: number; failed: number; skipped: number; error?: string }>("/api/capital/admin", { action: "sendCall", note }); setBlastMsg(`Call for projects: ${r.sent} of ${r.recipients} emails sent${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} skipped` : ""}${r.error ? ` (${r.error})` : ""}.`); }, ""); }} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold">Send call for projects</button>
          <button onClick={() => { if (!confirm("Remind everyone whose department has unfinished drafts or not-funded requests?")) return; run(async () => { const r = await postJson<{ recipients: number; sent: number; failed: number; skipped: number; error?: string }>("/api/capital/admin", { action: "sendReminders" }); setBlastMsg(r.recipients === 0 ? "Nobody has unfinished drafts or not-funded requests right now." : `Reminders: ${r.sent} of ${r.recipients} emails sent${r.failed ? `, ${r.failed} failed` : ""}${r.skipped ? `, ${r.skipped} skipped` : ""}${r.error ? ` (${r.error})` : ""}.`); }, ""); }} className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">Remind people with unfinished requests</button>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div><h2 className="text-lg font-semibold">Capacity: what can the Town afford each year?</h2><p className="text-sm text-gray-500">Enter the capital funding you expect to be able to commit (free cash, stabilization, debt service you can absorb). The Analysis tab compares it to the plan.</p></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{ov.planYears.filter(y => y > s.adoptedFY).map(y => <div key={y}><label htmlFor={`cap${y}`} className="block text-xs font-medium text-gray-600">{fy(y)}</label><div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span><input id={`cap${y}`} inputMode="numeric" value={cap[y] ?? ""} onChange={e => setCap(p => ({ ...p, [y]: e.target.value.replace(/\D/g, "") }))} className={inputCls + " pl-6 text-right tabular-nums"} /></div></div>)}</div>
        <button onClick={() => run(() => postJson("/api/capital/admin", { action: "saveSettings", capacityByYear: Object.fromEntries(Object.entries(cap).filter(([, v]) => v).map(([k, v]) => [k, Number(v)])) }), "Capacity saved.")} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold">Save capacity</button>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div><h2 className="text-lg font-semibold">Evaluation weights</h2><p className="text-sm text-gray-500">Based on your CIP manual: the 1–5 priority scale first, then criteria A–C, adjusted for how many people benefit and the benefits delivered. Added: <strong>readiness</strong> (is the scope and cost solid enough to fund?), consistent with GFOA capital-planning guidance. Set any weight to 0 to ignore it.</p></div>
        <div className="grid sm:grid-cols-2 gap-3">{CRITERIA.map(c => <div key={c.key} className="flex items-center gap-3"><input aria-label={`Weight for ${c.label}`} inputMode="numeric" value={wts[c.key]} onChange={e => setWts(p => ({ ...p, [c.key]: e.target.value.replace(/\D/g, "") }))} className={inputCls + " w-20 text-right"} /><div><p className="text-sm font-medium">{c.label}</p><p className="text-xs text-gray-500">{c.help}</p></div></div>)}</div>
        <p className="text-sm text-gray-600">Weights total {wsum}. Scores are relative, so they don’t need to add to 100.</p>
        <button onClick={() => run(() => postJson("/api/capital/admin", { action: "saveSettings", weights: Object.fromEntries(Object.entries(wts).map(([k, v]) => [k, Number(v) || 0])) }), "Weights saved.")} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold">Save weights</button>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div><h2 className="text-lg font-semibold">Departments and department heads</h2><p className="text-sm text-gray-500">Department heads can only see and edit projects in departments you assign them to. People must have a staff account first (Users → invite).</p></div>
        {ov.departments.map(d => (
          <div key={d.id} className="rounded-xl border border-gray-200 p-4 space-y-2">
            <div className="flex flex-wrap items-baseline gap-3"><h3 className="font-semibold">{d.name}</h3><span className="font-mono text-xs text-gray-400">CIP-{d.code}-###</span><span className="text-xs text-gray-500">{d.projectCount} projects</span><span className="flex-1" />
              {d.projectCount === 0 && <button onClick={() => { if (confirm(`Delete ${d.name}?`)) run(() => postJson("/api/capital/admin", { action: "deleteDepartment", id: d.id }), "Department deleted."); }} className="text-xs text-red-600 hover:underline">Delete</button>}</div>
            {ov.staff.length === 0 ? <p className="text-sm text-gray-500">No staff accounts yet.</p> : (
              <div className="flex flex-wrap gap-2">{ov.staff.map(st => { const on = d.members.some(m => m.staffUserId === st.id); return (
                <button key={st.id} aria-pressed={on} onClick={() => run(() => postJson("/api/capital/admin", { action: "setMembers", departmentId: d.id, staffUserIds: on ? d.members.filter(m => m.staffUserId !== st.id).map(m => m.staffUserId) : [...d.members.map(m => m.staffUserId), st.id] }), on ? `${st.name} removed from ${d.name}.` : `${st.name} added to ${d.name}.`)}
                  className={`px-3 py-1.5 rounded-full border text-sm ${on ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`} title={st.email}>{st.name}{st.department ? <span className={on ? "text-emerald-100" : "text-gray-400"}> · {st.department}</span> : null}</button>); })}</div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="dn" className="block text-xs font-medium text-gray-600">New department</label><input id="dn" value={newDept.name} onChange={e => setNewDept(p => ({ ...p, name: e.target.value }))} className={inputCls + " w-64"} /></div>
          <div><label htmlFor="dc" className="block text-xs font-medium text-gray-600">Code (2–5 letters)</label><input id="dc" value={newDept.code} maxLength={5} onChange={e => setNewDept(p => ({ ...p, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") }))} className={inputCls + " w-28"} /></div>
          <button onClick={() => run(async () => { await postJson("/api/capital/admin", { action: "saveDepartment", ...newDept }); setNewDept({ name: "", code: "" }); }, "Department added.")} disabled={newDept.name.length < 2 || newDept.code.length < 2} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold disabled:opacity-40">Add</button>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div><h2 className="text-lg font-semibold">Prior-year funded projects</h2>
          <p className="text-sm text-gray-500">Add capital projects from earlier years so residents can look back at what was funded. Each one is published as a funded project; if the same department and title was funded in another year, the new year is added to that one project instead of creating a duplicate. Nothing is saved until you confirm the preview.</p></div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="font-medium text-sm">From a spreadsheet</p>
            <p className="text-xs text-gray-500">Columns: Fiscal Year, Department, Project, Amount, and optionally Funding Source (or one column per source), Description, Status. <a href="/api/capital/admin/template" className="text-blue-600 hover:underline">Download the template</a>.</p>
            <input type="file" accept=".xlsx,.csv" aria-label="Choose a prior-year spreadsheet" onChange={e => { setHistFile(e.target.files?.[0] ?? null); setHist(null); }} className="text-sm" />
            <div><button disabled={!histFile || histBusy} onClick={() => sendHistory("preview", "file")} className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">{histBusy ? "Reading…" : "Preview spreadsheet"}</button></div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4 space-y-2">
            <p className="font-medium text-sm">From capital data you already uploaded</p>
            <p className="text-xs text-gray-500">Uses the capital project lists previously uploaded under Upload for fiscal years before FY{s.adoptedFY}.</p>
            <div><button disabled={histBusy} onClick={() => sendHistory("preview", "legacy")} className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">{histBusy ? "Reading…" : "Preview uploaded data"}</button></div>
          </div>
        </div>
        {hist && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3 text-sm">
            <p><strong>{hist.create}</strong> new project{hist.create === 1 ? "" : "s"}, <strong>{hist.addYear}</strong> funding year{hist.addYear === 1 ? "" : "s"} added to existing projects, {hist.skip} already recorded or repeated. Total <strong>{money(hist.amount)}</strong>.</p>
            {hist.byYear.length > 0 && <p className="text-gray-600">{hist.byYear.map(y => `FY${y.fiscalYear}: ${y.count} projects, ${moneyShort(y.amount)}`).join(" · ")}</p>}
            {hist.newDepartments.length > 0 && <p>New departments that will be created: <strong>{hist.newDepartments.join(", ")}</strong>. If any of these is another name for an existing department, fix the spelling in your file first.</p>}
            {hist.warnings.map((w, i) => <p key={i} className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{w}</p>)}
            {hist.errors.length > 0 && <div className="rounded-lg bg-red-50 border border-red-200 p-3"><p className="font-semibold text-red-800">{hist.errors.length} row{hist.errors.length === 1 ? "" : "s"} can&apos;t be imported:</p><ul className="list-disc pl-5 text-red-800 mt-1">{hist.errors.slice(0, 8).map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}</ul></div>}
            <details><summary className="cursor-pointer text-gray-700">Preview the first rows</summary><ul className="mt-2 space-y-1 text-xs text-gray-600">{hist.sample.map((r, i) => <li key={i}>FY{r.fiscalYear} · {r.department} · {r.title} · {money(r.amount)} — <em>{r.action === "create" ? "new project" : r.action === "add_year" ? r.reason : `skipped: ${r.reason}`}</em></li>)}</ul></details>
            <button disabled={histBusy || hist.create + hist.addYear === 0} onClick={() => sendHistory("commit", histSource)} className="px-5 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">{histBusy ? "Importing…" : `Import ${hist.create + hist.addYear} item${hist.create + hist.addYear === 1 ? "" : "s"}`}</button>
          </div>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div><h2 className="text-lg font-semibold">Import the FY2027 approved plan and FY2027–32 requests</h2>
          <p className="text-sm text-gray-500">Creates one project per request from the two documents you provided (58 projects, 28 of them funded in FY2027), with funding sources, locks the funded ones, and leaves the rest as requests for departments to complete. Safe to run again: projects already imported are skipped and never overwritten.</p></div>
        <p className="text-sm text-gray-600">{ov.seed.imported} of {ov.seed.total} already imported.</p>
        {ov.seed.remaining > 0 && <button onClick={() => run(async () => setPreview(await postJson("/api/capital/admin", { action: "previewSeed" })), "")} className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-sm font-semibold hover:bg-gray-50">Preview import</button>}
        {preview && (
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 space-y-3 text-sm">
            <p><strong>{preview.newCount}</strong> projects will be created ({preview.funded.count} funded in FY2027 totaling <strong>{money(preview.funded.amount)}</strong>, {preview.notFunded} requested for FY2027 but not funded).</p>
            {preview.newDepartments.length > 0 && <p>New departments: {preview.newDepartments.join(", ")}.</p>}
            <p className="text-gray-600">Requested by year: {Object.entries(preview.requestedByYear).map(([y, v]) => `FY${y} ${moneyShort(v)}`).join(" · ")}</p>
            {preview.reviewNotes.length > 0 && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3"><p className="font-semibold text-amber-900">Please confirm these judgment calls (you can edit any project afterward):</p><ul className="list-disc pl-5 text-amber-900 mt-1 space-y-1">{preview.reviewNotes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
            <button onClick={() => run(async () => { await postJson("/api/capital/admin", { action: "commitSeed" }); setPreview(null); }, "Import complete. Funded FY2027 projects are published and locked.")} className="px-5 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800">Import {preview.newCount} projects</button>
          </div>
        )}
      </section>
    </div>
  );
}
