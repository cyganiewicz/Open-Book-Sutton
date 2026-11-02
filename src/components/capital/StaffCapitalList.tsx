"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ProjectRow } from "@/lib/capital/projects";
import type { CapitalSettings } from "@/lib/capital/constants";
import { fundingLabel, planYears, submissionsOpenNow } from "@/lib/capital/constants";
import { ErrorBox, Meter, Pill, ProjectStatusPill, StatusPill, api, fy, inputCls, money, moneyShort, postJson } from "@/components/capital/parts";

type Tab = "requests" | "funded" | "deferred";
const REQUEST_STATES = ["draft", "not_funded", "submitted", "under_review", "recommended"];

export default function StaffCapitalList() {
  const [data, setData] = useState<{ rows: ProjectRow[]; settings: CapitalSettings } | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab | null>(null);
  const [q, setQ] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  const load = useCallback(async () => {
    try { setData(await api<{ rows: ProjectRow[]; settings: CapitalSettings }>("/api/capital/projects")); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load your projects."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const requests = rows.filter(r => REQUEST_STATES.includes(r.requestStatus));
  const funded = rows.filter(r => r.requestStatus === "approved");
  const parked = rows.filter(r => ["deferred", "withdrawn"].includes(r.requestStatus));

  // Land on what people are actively working on; fall back to funded projects if there is nothing open
  useEffect(() => { if (data && tab === null) setTab(requests.length > 0 ? "requests" : funded.length > 0 ? "funded" : "requests"); }, [data, tab, requests.length, funded.length]);

  if (error) return <ErrorBox message={error} />;
  if (!data || !tab) return <p className="text-gray-500">Loading…</p>;
  const { settings } = data;
  const years = planYears(settings);
  const open = submissionsOpenNow(settings);
  const attention = requests.filter(r => ["draft", "not_funded"].includes(r.requestStatus));
  const inReview = requests.filter(r => ["submitted", "under_review", "recommended"].includes(r.requestStatus));
  const amountFor = (r: ProjectRow, y: string) => { const x = r.years.find(v => v.fiscalYear === y); return x ? (x.approvedAmount ?? x.requestedAmount) : 0; };

  const RequestTable = ({ list }: { list: ProjectRow[] }) => (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
          <th className="px-4 py-2 font-semibold">Project</th><th className="px-2 py-2 font-semibold">Status</th>
          {years.map(y => <th key={y} className="px-2 py-2 font-semibold text-right">{fy(y)}</th>)}<th className="px-4 py-2 font-semibold w-28">Complete</th>
        </tr></thead>
        <tbody>
          {list.map(r => (
            <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3"><Link href={`/staff/capital/${r.id}`} className="font-medium text-emerald-800 hover:underline">{r.title}</Link>
                <p className="text-xs text-gray-400 font-mono">{r.code}{r.carriedForward && <span className="ml-2 not-italic font-sans"><Pill tone="blue">Carried over from FY{settings.adoptedFY}</Pill></span>}</p></td>
              <td className="px-2 py-3 whitespace-nowrap"><StatusPill status={r.requestStatus} /></td>
              {years.map(y => { const a = amountFor(r, y); return <td key={y} className={`px-2 py-3 text-right tabular-nums ${a ? "text-gray-800" : "text-gray-300"}`}>{a ? moneyShort(a) : "—"}</td>; })}
              <td className="px-4 py-3"><Meter value={r.readiness} label="Completeness" /><span className="text-xs text-gray-400 tabular-nums">{r.readiness}%</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Funded projects, grouped by the fiscal year they were funded (newest first). A project funded in several years appears under each.
  const fundedByYear = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const entries = funded.filter(r => !needle || `${r.title} ${r.code}`.toLowerCase().includes(needle))
      .flatMap(r => r.years.filter(y => y.approvedAmount !== null && (!yearFilter || y.fiscalYear === yearFilter)).map(y => ({ r, y })));
    const map = new Map<string, typeof entries>();
    for (const e of entries) map.set(e.y.fiscalYear, [...(map.get(e.y.fiscalYear) ?? []), e]);
    return [...map].sort((a, b) => b[0].localeCompare(a[0])).map(([year, list]) => ({ year, list: list.sort((a, b) => a.r.title.localeCompare(b.r.title)), total: list.reduce((s, e) => s + (e.y.approvedAmount ?? 0), 0) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, yearFilter]);
  const fundedYears = [...new Set(funded.flatMap(r => r.years.filter(y => y.approvedAmount !== null).map(y => y.fiscalYear)))].sort().reverse();

  const reactivate = async (id: string) => { try { await postJson(`/api/capital/projects/${id}/action`, { action: "reactivate" }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not reactivate."); } };

  const tabs: [Tab, string, number][] = [["requests", "Requests", requests.length], ["funded", "Funded", funded.length], ["deferred", "Deferred", parked.length]];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Capital projects</h1>
          <p className="text-gray-600 text-sm mt-1">Request, update and track capital projects for your department.</p>
        </div>
        {open && <Link href="/staff/capital/new" className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800">+ New project request</Link>}
      </div>
      <div className={`rounded-xl border px-4 py-3 text-sm ${open ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
        {open
          ? <>Capital requests are <strong>open</strong>{settings.submissionDeadline ? <> until <strong>{new Date(settings.submissionDeadline + "T12:00:00").toLocaleDateString("en-US", { dateStyle: "long" })}</strong></> : null}. FY{settings.adoptedFY} is the adopted budget; you can request funding for FY{Number(settings.adoptedFY) + 1} and later.</>
          : <>Capital requests are <strong>closed</strong> for editing. You can still post updates and photos on funded projects.</>}
      </div>
      {rows.length === 0 && <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">No projects are assigned to you yet. If you expected to see some, ask the Town Manager’s office to add you to your department.</p>}

      {rows.length > 0 && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit" role="tablist" aria-label="Project lists">
          {tabs.map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-1.5 rounded-md text-sm font-medium ${tab === k ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>{label} <span className="text-gray-400 tabular-nums">{n}</span></button>
          ))}
        </div>
      )}

      {rows.length > 0 && tab === "requests" && (
        <div className="space-y-8">
          {requests.length === 0 && <p className="text-sm text-gray-600 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-8 text-center">No open requests. {open ? "Use “New project request” to start one." : ""}</p>}
          {attention.length > 0 && <section className="space-y-2"><h2 className="font-semibold text-gray-900">Needs your attention <span className="text-gray-400 font-normal">({attention.length})</span></h2><p className="text-sm text-gray-500">Drafts to finish and submit. Requests carried over from the last cycle are here so your earlier work isn’t lost: update them, then submit, or defer anything you aren’t pursuing right now.</p><RequestTable list={attention} /></section>}
          {inReview.length > 0 && <section className="space-y-2"><h2 className="font-semibold text-gray-900">Submitted and in review <span className="text-gray-400 font-normal">({inReview.length})</span></h2><RequestTable list={inReview} /></section>}
        </div>
      )}

      {rows.length > 0 && tab === "funded" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Approved details are locked. Open a project to post a status update, add photos, or revise later-year requests.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div><label htmlFor="fq" className="block text-xs font-medium text-gray-500">Search funded projects</label><input id="fq" value={q} onChange={e => setQ(e.target.value)} placeholder="Title or code" className={inputCls + " w-64"} /></div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by fiscal year">
              <button type="button" aria-pressed={!yearFilter} onClick={() => setYearFilter("")} className={`px-3 py-1.5 rounded-full border text-sm ${!yearFilter ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>All years</button>
              {fundedYears.map(y => <button key={y} type="button" aria-pressed={yearFilter === y} onClick={() => setYearFilter(yearFilter === y ? "" : y)} className={`px-3 py-1.5 rounded-full border text-sm ${yearFilter === y ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>{fy(y)}</button>)}
            </div>
          </div>
          {fundedByYear.length === 0 && <p className="text-sm text-gray-600 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-8 text-center">{funded.length === 0 ? "None of your projects have been funded yet." : "No funded projects match."}</p>}
          {fundedByYear.map((g, i) => (
            <details key={g.year} open={i === 0 || !!q || !!yearFilter} className="bg-white border border-gray-200 rounded-2xl overflow-hidden group">
              <summary className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 cursor-pointer select-none list-none hover:bg-gray-50">
                <span aria-hidden="true" className="text-gray-400 text-xs transition-transform group-open:rotate-90">▶</span>
                <span className="font-semibold text-gray-900">{fy(g.year)}</span>
                <span className="text-sm text-gray-500">{g.list.length} project{g.list.length === 1 ? "" : "s"}</span>
                <span className="flex-1" />
                <span className="font-semibold tabular-nums text-emerald-800">{money(g.total)}</span>
              </summary>
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500"><th className="px-5 py-2 font-semibold">Project</th><th className="px-2 py-2 font-semibold text-right">Funded</th><th className="px-2 py-2 font-semibold">Paid for with</th><th className="px-5 py-2 font-semibold">Status</th></tr></thead>
                  <tbody>{g.list.map(({ r, y }) => (
                    <tr key={r.id + y.fiscalYear} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-5 py-2.5"><Link href={`/staff/capital/${r.id}`} className="font-medium text-emerald-800 hover:underline">{r.title}</Link><p className="text-xs text-gray-400 font-mono">{r.code}</p></td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-semibold text-emerald-800">{money(y.approvedAmount)}</td>
                      <td className="px-2 py-2.5 text-gray-600">{Object.keys(y.fundingSplit ?? {}).map(fundingLabel).join(", ") || <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-2.5 whitespace-nowrap">{r.projectStatus === "unreported" ? <span className="text-gray-300">—</span> : <ProjectStatusPill status={r.projectStatus} />}{r.percentComplete ? <span className="ml-2 text-xs text-gray-500 tabular-nums">{r.percentComplete}%</span> : null}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}

      {rows.length > 0 && tab === "deferred" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Deferred requests are set aside and aren’t part of the active plan. Reactivate one when you’re ready to work on it again.</p>
          {parked.length === 0 ? <p className="text-sm text-gray-600 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-8 text-center">Nothing is deferred.</p> : (
            <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
              {parked.map(r => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0"><Link href={`/staff/capital/${r.id}`} className="font-medium text-emerald-800 hover:underline">{r.title}</Link><p className="text-xs text-gray-400 font-mono">{r.code}</p></div>
                  <StatusPill status={r.requestStatus} />
                  <span className="flex-1" />
                  {r.requestStatus === "deferred" && open && <button onClick={() => reactivate(r.id)} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Reactivate</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
