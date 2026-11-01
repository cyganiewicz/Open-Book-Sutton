"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProjectRow } from "@/lib/capital/projects";
import type { CapitalSettings } from "@/lib/capital/constants";
import { displayYears, submissionsOpenNow } from "@/lib/capital/constants";
import { ErrorBox, Meter, ProjectStatusPill, StatusPill, api, moneyShort, fy } from "@/components/capital/parts";

export default function StaffCapitalList() {
  const [data, setData] = useState<{ rows: ProjectRow[]; settings: CapitalSettings } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<{ rows: ProjectRow[]; settings: CapitalSettings }>("/api/capital/projects").then(setData).catch(e => setError(e.message)); }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <p className="text-gray-500">Loading…</p>;
  const { rows, settings } = data;
  const years = displayYears(settings);
  const open = submissionsOpenNow(settings);
  const attention = rows.filter(r => ["draft", "not_funded"].includes(r.requestStatus));
  const funded = rows.filter(r => r.requestStatus === "approved");
  const inReview = rows.filter(r => ["submitted", "under_review", "recommended"].includes(r.requestStatus));
  const amountFor = (r: ProjectRow, y: string) => { const x = r.years.find(v => v.fiscalYear === y); return x ? (x.approvedAmount ?? x.requestedAmount) : 0; };

  const Table = ({ list }: { list: ProjectRow[] }) => (
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
                <p className="text-xs text-gray-400 font-mono">{r.code} · {r.departmentName}</p></td>
              <td className="px-2 py-3 whitespace-nowrap space-y-1"><StatusPill status={r.requestStatus} />{r.requestStatus === "approved" && <div><ProjectStatusPill status={r.projectStatus} /></div>}</td>
              {years.map(y => { const a = amountFor(r, y); const approved = r.years.find(v => v.fiscalYear === y)?.approvedAmount != null; return <td key={y} className={`px-2 py-3 text-right tabular-nums ${approved ? "font-semibold text-emerald-800" : a ? "text-gray-800" : "text-gray-300"}`}>{a ? moneyShort(a) : "—"}</td>; })}
              <td className="px-4 py-3"><Meter value={r.readiness} label="Completeness" /><span className="text-xs text-gray-400 tabular-nums">{r.readiness}%</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-8">
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
      {attention.length > 0 && <section className="space-y-2"><h2 className="font-semibold text-gray-900">Needs your attention <span className="text-gray-400 font-normal">({attention.length})</span></h2><p className="text-sm text-gray-500">Drafts to finish, and requests that weren’t funded that you can revise and resubmit.</p><Table list={attention} /></section>}
      {funded.length > 0 && <section className="space-y-2"><h2 className="font-semibold text-gray-900">Funded projects <span className="text-gray-400 font-normal">({funded.length})</span></h2><p className="text-sm text-gray-500">Approved details are locked. Open a project to post a status update, add photos, or revise later-year requests.</p><Table list={funded} /></section>}
      {inReview.length > 0 && <section className="space-y-2"><h2 className="font-semibold text-gray-900">Requests in review <span className="text-gray-400 font-normal">({inReview.length})</span></h2><Table list={inReview} /></section>}
    </div>
  );
}
