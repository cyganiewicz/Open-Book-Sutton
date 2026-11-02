"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectDTO } from "@/lib/capital/projects";
import {
  CATEGORIES, COST_COMPONENTS, CRITERIA, ESTIMATE_TYPES, FUNDING_SOURCES, PRIORITIES, PROJECT_STATUSES, REQUEST_STATUSES, fundingLabel,
} from "@/lib/capital/constants";
import {
  ApiError, Confirm, ErrorBox, Field, Meter, MoneyInput, Pill, ProjectStatusPill, Section, StatusPill, TextArea,
  inputCls, money, postJson, resizeImage, api, fy,
} from "./parts";

interface Props {
  initial: ProjectDTO;
  mode: "admin" | "staff";
  adoptedFY: string;
  weights: Record<string, number>;
  departments?: { id: string; name: string }[];
  townSlug: string;
}

interface FormState {
  title: string; description: string; location: string; category: string; priority: string; deptRank: string;
  whyImportant: string; alternatives: string; whoServed: string; usersServed: string; usefulLifeYears: string;
  consequences: string; maintenanceNeeds: string; costBasis: string; benefits: string; estimateType: string; quoteDate: string;
  grantEligible: boolean; grantNotes: string; operatingImpact: string; operatingImpactNotes: string;
  costBreakdown: { label: string; amount: string }[]; proposedFunding: string[]; departmentId: string;
}
type YearForm = Record<string, { requested: string; recommended: string }>;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const formFrom = (p: ProjectDTO): FormState => ({
  title: p.title, description: s(p.description), location: s(p.location), category: s(p.category), priority: s(p.priority), deptRank: s(p.deptRank),
  whyImportant: s(p.whyImportant), alternatives: s(p.alternatives), whoServed: s(p.whoServed), usersServed: s(p.usersServed),
  usefulLifeYears: s(p.usefulLifeYears), consequences: s(p.consequences), maintenanceNeeds: s(p.maintenanceNeeds), costBasis: s(p.costBasis),
  benefits: s(p.benefits), estimateType: s(p.estimateType), quoteDate: s(p.quoteDate), grantEligible: p.grantEligible, grantNotes: s(p.grantNotes),
  operatingImpact: s(p.operatingImpact), operatingImpactNotes: s(p.operatingImpactNotes),
  costBreakdown: p.costBreakdown.map(c => ({ label: c.label, amount: s(c.amount) })), proposedFunding: p.proposedFunding, departmentId: p.departmentId,
});
const yearsFrom = (p: ProjectDTO): YearForm =>
  Object.fromEntries(p.years.map(y => [y.fiscalYear, { requested: y.requestedAmount ? s(y.requestedAmount) : "", recommended: s(y.recommendedAmount) }]));
const sum = (xs: (string | number | null | undefined)[]) => xs.reduce<number>((a, x) => a + (Number(x) || 0), 0);

export default function CapitalProjectEditor({ initial, mode, adoptedFY, weights, departments = [], townSlug }: Props) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [f, setF] = useState<FormState>(() => formFrom(initial));
  const [ys, setYs] = useState<YearForm>(() => yearsFrom(initial));
  const [err, setErr] = useState<{ message: string; details: string[] }>({ message: "", details: [] });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const caps = project.caps;
  const isAdmin = mode === "admin" && caps.isAdmin;
  const base = `/api/capital/projects/${project.id}`;

  // ── dirty tracking ──
  const patch = useMemo(() => {
    const fields: Record<string, unknown> = {};
    const orig = formFrom(project);
    (Object.keys(f) as (keyof FormState)[]).forEach(k => { if (JSON.stringify(f[k]) !== JSON.stringify(orig[k])) fields[k] = f[k]; });
    const years: Record<string, { requestedAmount?: string; recommendedAmount?: string }> = {};
    const origY = yearsFrom(project);
    for (const y of project.years) {
      const a = ys[y.fiscalYear], b = origY[y.fiscalYear];
      if (!a || !b) continue;
      const yp: { requestedAmount?: string; recommendedAmount?: string } = {};
      if (a.requested !== b.requested) yp.requestedAmount = a.requested;
      if (isAdmin && a.recommended !== b.recommended) yp.recommendedAmount = a.recommended;
      if (Object.keys(yp).length) years[y.fiscalYear] = yp;
    }
    return { fields, years };
  }, [f, ys, project, isAdmin]);
  const dirty = Object.keys(patch.fields).length > 0 || Object.keys(patch.years).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const fail = (e: unknown) => {
    if (e instanceof ApiError) setErr({ message: e.message, details: e.details });
    else setErr({ message: "Something went wrong. Please try again.", details: [] });
  };
  const resetFrom = (p: ProjectDTO) => { setProject(p); setF(formFrom(p)); setYs(yearsFrom(p)); };

  async function save(): Promise<boolean> {
    setErr({ message: "", details: [] }); setMsg("");
    if (!dirty) return true;
    setBusy("save");
    try {
      const r = await postJson<{ project: ProjectDTO; refused: string[] }>(base, { fields: patch.fields, years: patch.years }, "PATCH");
      resetFrom(r.project);
      setMsg(r.refused.length ? `Saved. These couldn't be changed on a funded project: ${r.refused.join(", ")}.` : "Saved.");
      return true;
    } catch (e) { fail(e); return false; } finally { setBusy(null); }
  }

  async function act(action: string, payload: Record<string, unknown> = {}, label = action, okMsg = ""): Promise<boolean> {
    setErr({ message: "", details: [] }); setMsg("");
    if (["submit", "resubmit"].includes(action) && !(await save())) return false;
    setBusy(label);
    try {
      const wasDirty = dirty && !["submit", "resubmit"].includes(action);
      const p = await postJson<ProjectDTO>(`${base}/action`, { action, ...payload });
      if (wasDirty) setProject(p); else resetFrom(p);
      if (okMsg) setMsg(okMsg);
      return true;
    } catch (e) { fail(e); return false; } finally { setBusy(null); }
  }

  // ── helpers ──
  const lockedField = (k: string) => caps.lockedFields.includes(k);
  const canField = (k: string) => caps.canEditFields && !lockedField(k);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(prev => ({ ...prev, [k]: v }));
  const yearEditable = (y: string) => caps.editableYears.includes(y);
  const years = project.years;
  const totalRequested = sum(years.map(y => ys[y.fiscalYear]?.requested));
  const fundedYears = years.filter(y => y.approvedAmount !== null);
  const funded = fundedYears.length > 0 || project.requestStatus === "approved";
  const primary = project.attachments.find(a => a.kind === "photo" && a.isPrimary) ?? project.attachments.find(a => a.kind === "photo");
  const missing = project.readiness.items.filter(i => !i.done);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={isAdmin ? "/admin/capital" : "/staff/capital"} className="text-gray-500 hover:text-gray-800">← All projects</Link>
          <span className="text-gray-300">/</span>
          <span className="font-mono text-gray-500">{project.code}</span>
          <StatusPill status={project.requestStatus} />
          {funded && <ProjectStatusPill status={project.projectStatus} />}
          {project.isPublic && <Pill tone="blue">Public</Pill>}
          <span className="text-gray-500">{project.departmentName}</span>
        </div>
        <label htmlFor="title" className="sr-only">Project title</label>
        <input id="title" value={f.title} onChange={e => set("title", e.target.value)} disabled={!canField("title")}
          placeholder="Project title" className="w-full text-2xl font-semibold tracking-tight bg-transparent border-b border-transparent hover:border-gray-300 focus:border-emerald-600 focus:outline-none disabled:hover:border-transparent py-1" />
        {caps.readOnlyReason && <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{caps.readOnlyReason}</p>}
        {project.carriedForward && <p className="text-sm text-blue-900 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">Carried over from the FY{adoptedFY} cycle: this was requested but not funded. Your earlier work is saved here. Review the details, enter the years you&apos;d like it funded (FY{Number(adoptedFY) + 1} or later), then submit it. If you aren&apos;t pursuing it right now, you can defer it.</p>}
        {project.requestStatus === "deferred" && <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">This request is deferred, so it isn&apos;t part of the active plan. Your details are saved. Reactivate it when you&apos;re ready to work on it again.</p>}
        <ErrorBox message={err.message} details={err.details} />
        {msg && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}
      </div>

      {/* Readiness */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 grid sm:grid-cols-3 gap-4 items-center">
        <div className="sm:col-span-1">
          <p className="text-sm font-semibold text-gray-900">Request completeness</p>
          <p className="text-2xl font-semibold tabular-nums">{project.readiness.score}<span className="text-sm text-gray-400"> / 100</span></p>
          <Meter value={project.readiness.score} label="Request completeness" />
        </div>
        <div className="sm:col-span-2 text-sm text-gray-600">
          {missing.length === 0 ? <p>Everything the Town Manager’s office looks for is here. Nice work.</p> : (
            <>
              <p className="font-medium text-gray-800 mb-1">To make this request easier to evaluate, add:</p>
              <ul className="list-disc pl-5 space-y-0.5">{missing.slice(0, 5).map(m => <li key={m.key}>{m.label}</li>)}</ul>
            </>
          )}
        </div>
      </div>

      {/* Basics */}
      <Section title="The basics" subtitle="This is what Town Meeting and residents will read.">
        <div className="grid md:grid-cols-3 gap-5">
          <div className="md:col-span-2 space-y-5">
            <Field label="Description and purpose" htmlFor="desc" locked={lockedField("description")}
              hint="One paragraph: what the project is, the objective, the need and relevant history, and any efficiencies or savings.">
              <TextArea id="desc" value={f.description} onChange={v => set("description", v)} disabled={!canField("description")} rows={6} max={4000} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Category" htmlFor="cat" locked={lockedField("category")}>
                <select id="cat" value={f.category} onChange={e => set("category", e.target.value)} disabled={!canField("category")} className={inputCls}>
                  <option value="">Choose…</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Location (optional)" htmlFor="loc" locked={lockedField("location")}>
                <input id="loc" value={f.location} onChange={e => set("location", e.target.value)} disabled={!canField("location")} className={inputCls} placeholder="Building, road or facility" />
              </Field>
              {isAdmin && (
                <Field label="Department" htmlFor="dept">
                  <select id="dept" value={f.departmentId} onChange={e => set("departmentId", e.target.value)} className={inputCls}>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800 mb-1">Project picture</p>
            {primary ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/capital/files/${primary.id}`} alt={primary.caption || project.title} className="w-full aspect-[4/3] object-cover rounded-xl border border-gray-200" />
            ) : (
              <div className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-sm text-gray-400 text-center px-4">
                No photo yet. Add one under “Photos &amp; documents” below.
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-800">Priority category {lockedField("priority") && <span className="text-gray-400 text-xs">🔒</span>}</p>
          <p className="text-xs text-gray-500 mb-2">Choose the best fit using the Town’s capital priority scale. Rank your projects within each category.</p>
          <div className="grid sm:grid-cols-5 gap-2" role="radiogroup" aria-label="Priority category">
            {PRIORITIES.map(pr => {
              const on = f.priority === String(pr.value);
              return (
                <button key={pr.value} type="button" role="radio" aria-checked={on} disabled={!canField("priority")} onClick={() => set("priority", String(pr.value))}
                  className={`text-left rounded-xl border p-3 transition-colors disabled:opacity-60 ${on ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600" : "border-gray-200 hover:border-gray-300"}`}>
                  <span className="block text-xs font-semibold text-gray-500">Priority {pr.value}</span>
                  <span className="block text-sm font-semibold text-gray-900">{pr.label}</span>
                  <span className="block text-xs text-gray-500 mt-1">{pr.description}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 max-w-xs">
            <Field label="Rank within this priority (1 = most important)" htmlFor="rank">
              <input id="rank" inputMode="numeric" value={f.deptRank} onChange={e => set("deptRank", e.target.value.replace(/\D/g, ""))} disabled={!canField("deptRank")} className={inputCls} />
            </Field>
          </div>
        </div>
      </Section>

      {/* Costs */}
      <Section title="Costs and funding" subtitle={`Enter the cost for each year you'd like the project funded. FY${adoptedFY} is the adopted capital budget, so only later years can be requested.`}
        right={<div className="text-right"><p className="text-xs text-gray-500">Total requested</p><p className="text-xl font-semibold tabular-nums">{money(totalRequested)}</p></div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3 font-semibold"> </th>{years.map(y => <th key={y.fiscalYear} className="py-2 px-1 font-semibold text-right min-w-[7.5rem]">{fy(y.fiscalYear)}</th>)}
            </tr></thead>
            <tbody>
              <tr className="border-t border-gray-100">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-gray-700 whitespace-nowrap">Requested</th>
                {years.map(y => (
                  <td key={y.fiscalYear} className="py-2 px-1">
                    {yearEditable(y.fiscalYear)
                      ? <MoneyInput label={`Requested amount for ${fy(y.fiscalYear)}`} value={ys[y.fiscalYear]?.requested ?? ""} onChange={v => setYs(p => ({ ...p, [y.fiscalYear]: { ...(p[y.fiscalYear] ?? { recommended: "" }), requested: v } }))} />
                      : <p className="text-right tabular-nums px-2 text-gray-600" title={y.approvedAmount !== null ? "Funded — locked" : "Closed year"}>{y.requestedAmount ? money(y.requestedAmount) : "—"} {y.approvedAmount !== null && "🔒"}</p>}
                  </td>
                ))}
              </tr>
              {isAdmin && (
                <tr className="border-t border-gray-100 bg-violet-50/40">
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-violet-800 whitespace-nowrap">Recommended</th>
                  {years.map(y => (
                    <td key={y.fiscalYear} className="py-2 px-1">
                      <MoneyInput label={`Recommended amount for ${fy(y.fiscalYear)}`} value={ys[y.fiscalYear]?.recommended ?? ""} onChange={v => setYs(p => ({ ...p, [y.fiscalYear]: { ...(p[y.fiscalYear] ?? { requested: "" }), recommended: v } }))} />
                    </td>
                  ))}
                </tr>
              )}
              <tr className="border-t border-gray-100">
                <th scope="row" className="py-2 pr-3 text-left font-medium text-emerald-800 whitespace-nowrap">Funded</th>
                {years.map(y => <td key={y.fiscalYear} className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-800">{y.approvedAmount !== null ? money(y.approvedAmount) : <span className="text-gray-300 font-normal">—</span>}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        {fundedYears.length > 0 && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900 space-y-1">
            {fundedYears.map(y => (
              <p key={y.fiscalYear}><strong>{fy(y.fiscalYear)} funded: {money(y.approvedAmount)}</strong> — {Object.entries(y.fundingSplit).map(([k, v]) => `${fundingLabel(k)} ${money(v)}`).join(" · ") || "funding source not recorded"}</p>
            ))}
          </div>
        )}
        {years.some(y => y.notes) && (
          <ul className="text-xs text-gray-500 space-y-0.5">{years.filter(y => y.notes).map(y => <li key={y.fiscalYear}>{fy(y.fiscalYear)}: {y.notes}</li>)}</ul>
        )}

        <div className="grid md:grid-cols-2 gap-6 pt-2">
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-800">What the cost includes <span className="text-gray-400 font-normal">(optional)</span></p>
            {f.costBreakdown.map((row, i) => (
              <div key={i} className="flex gap-2">
                <input aria-label="Cost component" list="cost-components" value={row.label} disabled={!canField("costBreakdown")} onChange={e => set("costBreakdown", f.costBreakdown.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} className={inputCls} placeholder="e.g. Engineering" />
                <div className="w-40 shrink-0"><MoneyInput label="Component amount" value={row.amount} disabled={!canField("costBreakdown")} onChange={v => set("costBreakdown", f.costBreakdown.map((r, j) => j === i ? { ...r, amount: v } : r))} /></div>
                {canField("costBreakdown") && <button type="button" aria-label="Remove component" onClick={() => set("costBreakdown", f.costBreakdown.filter((_, j) => j !== i))} className="px-2 text-gray-400 hover:text-red-600">×</button>}
              </div>
            ))}
            <datalist id="cost-components">{COST_COMPONENTS.map(c => <option key={c} value={c} />)}</datalist>
            {canField("costBreakdown") && <button type="button" onClick={() => set("costBreakdown", [...f.costBreakdown, { label: "", amount: "" }])} className="text-sm text-emerald-700 font-medium hover:underline">+ Add a cost component</button>}
            {f.costBreakdown.length > 0 && <p className="text-xs text-gray-500">Components add up to {money(sum(f.costBreakdown.map(r => r.amount)))}</p>}
          </div>
          <div className="space-y-4">
            <Field label="How firm is the estimate?" htmlFor="est">
              <select id="est" value={f.estimateType} onChange={e => set("estimateType", e.target.value)} disabled={!canField("estimateType")} className={inputCls}>
                <option value="">Choose…</option>{ESTIMATE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Date of the quote or estimate" htmlFor="qd" hint="Projects requesting funding in the next budget year need a recent quote.">
              <input id="qd" type="date" value={f.quoteDate} onChange={e => set("quoteDate", e.target.value)} disabled={!canField("quoteDate")} className={inputCls} />
            </Field>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-800">Recommended ways to pay for it</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {FUNDING_SOURCES.map(src => {
              const on = f.proposedFunding.includes(src.key);
              return (
                <button key={src.key} type="button" aria-pressed={on} title={src.help} disabled={!canField("proposedFunding")}
                  onClick={() => set("proposedFunding", on ? f.proposedFunding.filter(k => k !== src.key) : [...f.proposedFunding, src.key])}
                  className={`px-3 py-1.5 rounded-full border text-sm disabled:opacity-60 ${on ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>{src.label}</button>
              );
            })}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <input type="checkbox" checked={f.grantEligible} onChange={e => set("grantEligible", e.target.checked)} disabled={!canField("grantEligible")} /> May be eligible for a federal or state grant
            </label>
            <TextArea value={f.grantNotes} onChange={v => set("grantNotes", v)} disabled={!canField("grantNotes")} rows={2} max={1000} />
            <p className="text-xs text-gray-500">Name the program and what you’ve done to pursue it, if anything.</p>
          </div>
          <div className="space-y-3">
            <Field label="Yearly operating cost or savings" htmlFor="op" hint="Maintenance and repair costs once built. Use a negative number for savings, or $0 if none.">
              <MoneyInput label="Annual operating impact" value={f.operatingImpact} disabled={!canField("operatingImpact")} onChange={v => set("operatingImpact", v)} placeholder="e.g. 2500 or -1200" />
            </Field>
            <Field label="Useful life (years)" htmlFor="life">
              <input id="life" inputMode="numeric" value={f.usefulLifeYears} onChange={e => set("usefulLifeYears", e.target.value.replace(/\D/g, ""))} disabled={!canField("usefulLifeYears")} className={inputCls} />
            </Field>
          </div>
        </div>
      </Section>

      {/* Questionnaire */}
      <Section title="Why this project matters" subtitle="The Town Manager’s office and the Select Board will ask these questions. Short, specific answers are best.">
        <div className="grid md:grid-cols-2 gap-5">
          {([
            ["whyImportant", "Why is this project important?"],
            ["alternatives", "What other alternatives were considered?"],
            ["whoServed", "Who will be served by this project?"],
            ["consequences", "What happens if it isn’t done?"],
            ["costBasis", "How were the costs developed?"],
            ["benefits", "What benefits will it provide?"],
            ["maintenanceNeeds", "What maintenance will the finished project need?"],
          ] as [keyof FormState, string][]).map(([k, label]) => (
            <Field key={k} label={label} htmlFor={k}>
              <TextArea id={k} value={f[k] as string} onChange={v => set(k, v as never)} disabled={!canField(k)} rows={3} max={3000} />
            </Field>
          ))}
          <Field label="Roughly how many people benefit?" htmlFor="users" hint="Residents, students, staff or users. An estimate is fine.">
            <input id="users" inputMode="numeric" value={f.usersServed} onChange={e => set("usersServed", e.target.value.replace(/\D/g, ""))} disabled={!canField("usersServed")} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Files */}
      <FilesSection project={project} caps={caps} onChange={setProject} baseUrl={base} fail={fail} />

      {/* Status (funded) */}
      {funded && <StatusSection project={project} canPost={caps.canPostStatus} onPost={(payload) => act("postStatus", payload, "status", "Status update posted.")} busy={busy === "status"} />}

      {/* Messages */}
      <MessagesSection project={project} isAdmin={isAdmin} canRequestChange={caps.canRequestChange} onSend={(kind, body) => act("comment", { kind, body }, "comment", "Message sent.")}
        onResolve={(id, resolved) => act("resolveComment", { commentId: id, resolved }, "resolve")} busy={busy === "comment"} />

      {/* Admin panels */}
      {isAdmin && project.evaluation && (
        <>
          <EvaluationPanel project={project} weights={weights} onSave={(payload) => act("evaluate", payload, "evaluate", "Evaluation saved.")} busy={busy === "evaluate"} />
          <FundingPanel project={project} adoptedFY={adoptedFY} onFund={(payload) => act("approveYear", payload, "fund", "Funding recorded. The project is now locked for the department.")}
            onUnfund={(y) => act("unapproveYear", { fiscalYear: y }, "unfund", "Approval removed.")} busy={busy === "fund"} />
          <Section title="Status and visibility">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Request status" htmlFor="rs">
                <select id="rs" value={project.requestStatus} disabled={funded} onChange={e => act("setRequestStatus", { status: e.target.value }, "rs", "Status updated.")} className={inputCls}>
                  {REQUEST_STATUSES.filter(x => x.key !== "approved" || funded).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
                {funded && <p className="text-xs text-gray-500 mt-1">Funded projects change status by removing the approval.</p>}
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800 pb-2">
                <input type="checkbox" checked={project.isPublic} onChange={e => act("setPublic", { isPublic: e.target.checked }, "pub", e.target.checked ? "Now visible on the public site." : "Hidden from the public site.")} /> Show on the public site
              </label>
              {project.isPublic && <Link href={`/${townSlug}/capital/${project.code}`} target="_blank" className="text-sm text-blue-600 hover:underline pb-2">View public page ↗</Link>}
            </div>
          </Section>
        </>
      )}

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={!dirty || busy === "save" || !caps.canEditFields}
            className="px-5 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40">{busy === "save" ? "Saving…" : "Save changes"}</button>
          {dirty && <span className="text-sm text-amber-700">You have unsaved changes</span>}
          <div className="flex-1" />
          <Link href={`/capital-sheet/${project.id}`} target="_blank" className="text-sm text-gray-600 hover:text-gray-900">Print project sheet</Link>
          {project.requestStatus === "draft" && caps.canSubmit && <button type="button" onClick={() => act("submit", {}, "submit", "Submitted to the Town Manager’s office.")} disabled={busy === "submit"} className="px-5 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">{busy === "submit" ? "Submitting…" : "Submit request"}</button>}
          {project.requestStatus === "not_funded" && caps.canResubmit && <button type="button" onClick={() => act("resubmit", {}, "submit", "Resubmitted for review.")} disabled={busy === "submit"} className="px-5 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">Resubmit for review</button>}
          {caps.canDefer && !funded && ["draft", "submitted", "under_review", "not_funded"].includes(project.requestStatus) && <Confirm message="Defer this request? It is set aside and left out of the active plan until you reactivate it." onConfirm={() => act("defer", {}, "defer", "Request deferred.")} className="text-sm text-gray-600 hover:text-gray-900 hover:underline">Defer</Confirm>}
          {caps.canReactivate && project.requestStatus === "deferred" && <button type="button" onClick={() => act("reactivate", {}, "reactivate", "Reactivated as a draft.")} disabled={busy === "reactivate"} className="px-5 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">Reactivate as a draft</button>}
          {caps.canWithdraw && !funded && <Confirm message="Withdraw this request? It will be removed from consideration." onConfirm={() => act("withdraw", {}, "withdraw", "Request withdrawn.")} className="text-sm text-red-600 hover:underline">Withdraw</Confirm>}
          {caps.canDelete && <Confirm message="Delete this draft? This can't be undone." onConfirm={async () => { try { await api(base, { method: "DELETE" }); router.push(isAdmin ? "/admin/capital" : "/staff/capital"); } catch (e) { fail(e); } }} className="text-sm text-red-600 hover:underline">Delete draft</Confirm>}
        </div>
      </div>
    </div>
  );
}

// ── Files ────────────────────────────────────────────────────────────────────

function FilesSection({ project, caps, onChange, baseUrl, fail }: { project: ProjectDTO; caps: ProjectDTO["caps"]; onChange: (p: ProjectDTO) => void; baseUrl: string; fail: (e: unknown) => void }) {
  const [uploading, setUploading] = useState(false);
  const [docKind, setDocKind] = useState("quote");
  const photoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const photos = project.attachments.filter(a => a.kind === "photo");
  const docs = project.attachments.filter(a => a.kind !== "photo");

  const reload = async () => onChange(await api<ProjectDTO>(baseUrl));
  async function upload(files: FileList | null, kind: string) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const prepared = kind === "photo" ? await resizeImage(file) : file;
        const fd = new FormData(); fd.append("file", prepared); fd.append("kind", kind);
        await api(`${baseUrl}/files`, { method: "POST", body: fd });
      }
      await reload();
    } catch (e) { fail(e); } finally { setUploading(false); if (photoInput.current) photoInput.current.value = ""; if (docInput.current) docInput.current.value = ""; }
  }
  const patchFile = async (id: string, body: Record<string, unknown>) => { try { await postJson(`/api/capital/files/${id}`, body, "PATCH"); await reload(); } catch (e) { fail(e); } };
  const removeFile = async (id: string) => { try { await api(`/api/capital/files/${id}`, { method: "DELETE" }); await reload(); } catch (e) { fail(e); } };

  return (
    <Section title="Photos & documents" subtitle="Photos appear on the public project page. Quotes and documents stay private unless you choose to share them.">
      {caps.canUploadFiles && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-dashed border-gray-300 p-4">
            <p className="text-sm font-medium text-gray-800">Add photos</p>
            <p className="text-xs text-gray-500 mb-2">JPG, PNG or WebP. Large photos are shrunk automatically.</p>
            <input ref={photoInput} type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Choose photos" onChange={e => upload(e.target.files, "photo")} disabled={uploading} className="text-sm" />
          </div>
          <div className="rounded-xl border border-dashed border-gray-300 p-4">
            <p className="text-sm font-medium text-gray-800">Add a quote or document (PDF)</p>
            <div className="flex gap-2 items-center mb-2">
              <select aria-label="Document type" value={docKind} onChange={e => setDocKind(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-md text-sm">
                <option value="quote">Vendor quote / estimate</option><option value="document">Other document</option>
              </select>
            </div>
            <input ref={docInput} type="file" accept="application/pdf" aria-label="Choose a PDF" onChange={e => upload(e.target.files, docKind)} disabled={uploading} className="text-sm" />
          </div>
        </div>
      )}
      {uploading && <p className="text-sm text-gray-500">Uploading…</p>}
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map(a => (
            <li key={a.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/capital/files/${a.id}`} alt={a.caption || a.fileName} className="w-full aspect-[4/3] object-cover" />
              <div className="p-2 space-y-1">
                <input aria-label={`Caption for ${a.fileName}`} defaultValue={a.caption ?? ""} placeholder="Add a caption" disabled={!caps.canUploadFiles}
                  onBlur={e => { if (e.target.value !== (a.caption ?? "")) patchFile(a.id, { caption: e.target.value }); }} className="w-full text-xs px-2 py-1 border border-gray-200 rounded" />
                <div className="flex items-center justify-between text-xs">
                  {a.isPrimary ? <Pill tone="green">Main photo</Pill> : caps.canUploadFiles ? <button type="button" onClick={() => patchFile(a.id, { isPrimary: true })} className="text-emerald-700 hover:underline">Make main</button> : <span />}
                  {caps.canUploadFiles && <button type="button" onClick={() => removeFile(a.id)} className="text-red-600 hover:underline">Remove</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {docs.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
          {docs.map(a => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <a href={`/api/capital/files/${a.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">{a.fileName}</a>
              <Pill tone={a.kind === "quote" ? "violet" : "gray"}>{a.kind === "quote" ? "Quote" : "Document"}</Pill>
              <span className="text-xs text-gray-400">{Math.round(a.size / 1024)} KB · {a.uploadedByName}</span>
              <span className="flex-1" />
              {caps.canUploadFiles && <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={a.isPublic} onChange={e => patchFile(a.id, { isPublic: e.target.checked })} /> Share publicly</label>}
              {caps.canUploadFiles && <button type="button" onClick={() => removeFile(a.id)} className="text-xs text-red-600 hover:underline">Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {photos.length === 0 && docs.length === 0 && <p className="text-sm text-gray-500">Nothing uploaded yet.</p>}
    </Section>
  );
}

// ── Status updates for funded projects ───────────────────────────────────────

function StatusSection({ project, canPost, onPost, busy }: { project: ProjectDTO; canPost: boolean; onPost: (p: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const [status, setStatus] = useState(project.projectStatus === "unreported" ? "not_started" : project.projectStatus);
  const [pct, setPct] = useState(String(project.percentComplete ?? 0));
  const [note, setNote] = useState("");
  const [actual, setActual] = useState("");
  return (
    <Section title="Project status" subtitle="Keep residents informed as funded work moves forward.">
      <div className="flex flex-wrap items-center gap-3">
        <ProjectStatusPill status={project.projectStatus} />
        {project.percentComplete !== null && <span className="text-sm text-gray-600 tabular-nums">{project.percentComplete}% complete</span>}
        {project.actualCost !== null && <span className="text-sm text-gray-600">Final cost {money(project.actualCost)}</span>}
      </div>
      {canPost && (
        <form className="grid md:grid-cols-4 gap-3 items-end" onSubmit={async e => { e.preventDefault(); if (await onPost({ status, percentComplete: pct, note, actualCost: status === "complete" ? actual : undefined })) setNote(""); }}>
          <Field label="Status" htmlFor="ps">
            <select id="ps" value={status} onChange={e => { setStatus(e.target.value as typeof status); if (e.target.value === "complete") setPct("100"); }} className={inputCls}>
              {PROJECT_STATUSES.filter(x => x.key !== "unreported").map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </Field>
          <Field label={`Percent complete (${pct}%)`} htmlFor="pp">
            <input id="pp" type="range" min={0} max={100} step={5} value={pct} onChange={e => setPct(e.target.value)} className="w-full" />
          </Field>
          {status === "complete" && <Field label="Final cost (optional)" htmlFor="ac"><MoneyInput label="Final cost" value={actual} onChange={setActual} /></Field>}
          <div className="md:col-span-4">
            <Field label="What’s the latest?" htmlFor="pn" hint="This note is shown on the public project page.">
              <TextArea id="pn" value={note} onChange={setNote} rows={2} max={2000} />
            </Field>
          </div>
          <button type="submit" disabled={busy || note.trim().length < 3} className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 w-fit">{busy ? "Posting…" : "Post update"}</button>
        </form>
      )}
      <ol className="space-y-3 border-l-2 border-gray-200 pl-4">
        {project.updates.map(u => (
          <li key={u.id}>
            <p className="text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })} · {u.authorRole === "system" ? "System" : u.authorName} {u.percentComplete !== null && `· ${u.percentComplete}%`}</p>
            <p className="text-sm text-gray-800"><ProjectStatusPill status={u.status} /> <span className="ml-1">{u.note}</span></p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ── Messages ─────────────────────────────────────────────────────────────────

function MessagesSection({ project, isAdmin, canRequestChange, onSend, onResolve, busy }: {
  project: ProjectDTO; isAdmin: boolean; canRequestChange: boolean; busy: boolean;
  onSend: (kind: string, body: string) => Promise<boolean>; onResolve: (id: string, resolved: boolean) => Promise<boolean>;
}) {
  const [kind, setKind] = useState(isAdmin ? "admin_note" : "change_request");
  const [body, setBody] = useState("");
  const label = (k: string) => (k === "change_request" ? "Change request" : k === "admin_note" ? "Admin note (private)" : "Note");
  if (!isAdmin && !canRequestChange && project.comments.length === 0) return null;
  return (
    <Section title={isAdmin ? "Notes and change requests" : "Request a change"} subtitle={isAdmin ? "Private notes are never shown to departments or the public." : "Funded details are locked. Tell the Town Manager’s office what needs to change and why."}>
      <ul className="space-y-2">
        {project.comments.map(c => (
          <li key={c.id} className={`rounded-lg border px-3 py-2 text-sm ${c.kind === "admin_note" ? "bg-amber-50 border-amber-200" : c.kind === "change_request" ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
            <p className="text-xs text-gray-500">{label(c.kind)} · {c.authorName} · {new Date(c.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })} {c.resolved && "· ✓ resolved"}</p>
            <p className="text-gray-800 whitespace-pre-wrap">{c.body}</p>
            {isAdmin && c.kind === "change_request" && <button type="button" onClick={() => onResolve(c.id, !c.resolved)} className="text-xs text-blue-700 hover:underline mt-1">{c.resolved ? "Reopen" : "Mark resolved"}</button>}
          </li>
        ))}
      </ul>
      {(isAdmin || canRequestChange) && (
        <form className="space-y-2" onSubmit={async e => { e.preventDefault(); if (await onSend(kind, body)) setBody(""); }}>
          {isAdmin && (
            <select aria-label="Message type" value={kind} onChange={e => setKind(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-md text-sm">
              <option value="admin_note">Private admin note</option><option value="note">Note visible to the department</option>
            </select>
          )}
          <TextArea value={body} onChange={setBody} rows={3} max={3000} />
          <button type="submit" disabled={busy || body.trim().length < 2} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">{isAdmin ? "Add note" : "Send change request"}</button>
        </form>
      )}
    </Section>
  );
}

// ── Admin: evaluation ────────────────────────────────────────────────────────

function EvaluationPanel({ project, weights, onSave, busy }: { project: ProjectDTO; weights: Record<string, number>; onSave: (p: Record<string, unknown>) => Promise<boolean>; busy: boolean }) {
  const ev = project.evaluation!;
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(ev.scores).map(([k, v]) => [k, String(v)])));
  const [notes, setNotes] = useState(ev.notes ?? "");
  const [override, setOverride] = useState(ev.priorityOverride ? String(ev.priorityOverride) : "");
  const comp = ev.composite;
  return (
    <Section title="Review and evaluation (private)" subtitle="Score each criterion 0–5. Priority and readiness are calculated for you. Weights are set under Setup."
      right={<div className="text-right"><p className="text-xs text-gray-500">Composite score</p><p className="text-3xl font-semibold tabular-nums">{comp.score ?? "—"}</p><p className="text-xs text-gray-500">{comp.scoredCriteria} of {comp.totalCriteria} criteria scored</p></div>}>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field label="Priority override" htmlFor="po" hint={`Department chose ${project.priority ?? "no"} priority. Leave blank to use theirs.`}>
            <select id="po" value={override} onChange={e => setOverride(e.target.value)} className={inputCls}>
              <option value="">Use department’s priority</option>{PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.value} – {p.label}</option>)}
            </select>
          </Field>
          {CRITERIA.filter(c => c.source === "admin").map(c => (
            <div key={c.key}>
              <label htmlFor={`sc-${c.key}`} className="flex justify-between text-sm font-medium text-gray-800"><span>{c.label}</span><span className="tabular-nums text-gray-500">{scores[c.key] ?? "–"} / 5 · weight {weights[c.key] ?? c.weight}</span></label>
              <p className="text-xs text-gray-500">{c.help}</p>
              <input id={`sc-${c.key}`} type="range" min={0} max={5} step={1} value={scores[c.key] ?? "0"} onChange={e => setScores(p => ({ ...p, [c.key]: e.target.value }))} className="w-full" />
              <button type="button" onClick={() => setScores(p => { const n = { ...p }; delete n[c.key]; return n; })} className="text-xs text-gray-400 hover:text-gray-700">clear</button>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-800 mb-1">How the score is built</p>
            <table className="w-full text-xs"><tbody>
              {comp.parts.map(p => (
                <tr key={p.key} className="border-t border-gray-100">
                  <td className="py-1 pr-2 text-gray-700">{p.label}</td><td className="py-1 text-right tabular-nums text-gray-400">wt {p.weight}</td>
                  <td className="py-1 pl-2 text-right tabular-nums font-medium">{p.points === null ? <span className="text-gray-300">not scored</span> : Math.round(p.points)}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800 mb-1">Readiness checklist</p>
            <ul className="text-xs space-y-0.5">{project.readiness.items.map(i => <li key={i.key} className={i.done ? "text-emerald-700" : "text-gray-400"}>{i.done ? "✓" : "○"} {i.label} <span className="text-gray-400">({i.points})</span></li>)}</ul>
          </div>
          <Field label="Evaluation notes" htmlFor="en"><TextArea id="en" value={notes} onChange={setNotes} rows={3} max={5000} /></Field>
          <button type="button" disabled={busy} onClick={() => onSave({ scores, notes, priorityOverride: override })} className="px-4 py-2 rounded-lg bg-violet-700 text-white text-sm font-semibold hover:bg-violet-800 disabled:opacity-50">{busy ? "Saving…" : "Save evaluation"}</button>
        </div>
      </div>
    </Section>
  );
}

// ── Admin: funding decision ──────────────────────────────────────────────────

function FundingPanel({ project, adoptedFY, onFund, onUnfund, busy }: { project: ProjectDTO; adoptedFY: string; onFund: (p: Record<string, unknown>) => Promise<boolean>; onUnfund: (fy: string) => Promise<boolean>; busy: boolean }) {
  const firstOpen = project.years.find(y => y.approvedAmount === null && y.fiscalYear >= adoptedFY && (y.recommendedAmount ?? y.requestedAmount) > 0)?.fiscalYear ?? project.years.find(y => y.approvedAmount === null)?.fiscalYear ?? adoptedFY;
  const [year, setYear] = useState(firstOpen);
  const yr = project.years.find(y => y.fiscalYear === year);
  const [amount, setAmount] = useState(String(yr ? yr.recommendedAmount ?? yr.requestedAmount : ""));
  const [split, setSplit] = useState<Record<string, string>>({});
  const total = sum(Object.values(split));
  const diff = (Number(amount) || 0) - total;
  const pick = (y: string) => { setYear(y); const r = project.years.find(x => x.fiscalYear === y); setAmount(String(r ? r.recommendedAmount ?? r.requestedAmount : "")); setSplit({}); };
  return (
    <Section title="Funding decision" subtitle="Funding a year records the approved amount and sources, publishes the project, and locks it for the department.">
      {project.years.filter(y => y.approvedAmount !== null).map(y => (
        <div key={y.fiscalYear} className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
          <strong>{fy(y.fiscalYear)}: {money(y.approvedAmount)}</strong>
          <span className="text-emerald-900">{Object.entries(y.fundingSplit).map(([k, v]) => `${fundingLabel(k)} ${money(v)}`).join(" · ")}</span>
          <span className="flex-1" />
          <Confirm message={`Remove the FY${y.fiscalYear} approval? The project will be unlocked and hidden from the public site.`} onConfirm={() => onUnfund(y.fiscalYear)} className="text-xs text-red-600 hover:underline">Remove approval</Confirm>
        </div>
      ))}
      <div className="grid md:grid-cols-3 gap-4">
        <Field label="Fiscal year" htmlFor="fy"><select id="fy" value={year} onChange={e => pick(e.target.value)} className={inputCls}>{project.years.filter(y => y.approvedAmount === null).map(y => <option key={y.fiscalYear} value={y.fiscalYear}>{fy(y.fiscalYear)}</option>)}</select></Field>
        <Field label="Approved amount" htmlFor="am"><MoneyInput label="Approved amount" value={amount} onChange={setAmount} /></Field>
        <div className="text-sm self-end pb-2">
          {Math.abs(diff) < 0.01 && total > 0 ? <span className="text-emerald-700 font-medium">Sources match the amount ✓</span> : <span className="text-amber-700">{money(Math.abs(diff))} {diff > 0 ? "still to assign to sources" : "over-assigned"}</span>}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {FUNDING_SOURCES.map(src => (
          <Field key={src.key} label={src.label}><MoneyInput label={`${src.label} amount`} value={split[src.key] ?? ""} onChange={v => setSplit(p => ({ ...p, [src.key]: v }))} /></Field>
        ))}
      </div>
      <button type="button" disabled={busy || !amount || Math.abs(diff) > 0.01} onClick={() => onFund({ fiscalYear: year, amount, funding: split })}
        className="px-5 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">{busy ? "Saving…" : `Fund this project for FY${year}`}</button>
    </Section>
  );
}
