export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPublicProject } from "@/lib/capital/public";
import { PRIORITIES, fundingLabel, projectStatusLabel } from "@/lib/capital/constants";
import { formatCurrency } from "@/lib/format";

const $ = (n: number) => formatCurrency(n);

export async function generateMetadata({ params }: { params: Promise<{ townSlug: string; code: string }> }) {
  const { townSlug, code } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug }, select: { id: true } });
  const p = town ? await getPublicProject(town.id, code) : null;
  return { title: p ? `${p.title} · Capital Projects` : "Capital Project" };
}

export default async function CapitalProjectPage({ params }: { params: Promise<{ townSlug: string; code: string }> }) {
  const { townSlug, code } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();
  const p = await getPublicProject(town.id, code);
  if (!p) return notFound();
  const color = town.primaryColor || "#2d6a4f";
  const funded = p.funded;
  const fundedYear = p.years.find(y => y.approved !== null);
  const requestedTotal = p.years.reduce((s, y) => s + (y.approved ?? y.requested), 0);
  const prio = PRIORITIES.find(x => x.value === p.priority);
  const qa: [string, string | null][] = [
    ["Why is this project important?", p.whyImportant], ["Who will it serve?", p.whoServed], ["What are the benefits?", p.benefits],
    ["What happens if it isn't done?", p.consequences], ["What alternatives were considered?", p.alternatives],
    ["What maintenance will it need?", p.maintenanceNeeds], ["How were the costs developed?", p.costBasis],
  ];
  const answered = qa.filter(([, v]) => v && v.trim());
  const primary = p.photos.find(x => x.isPrimary) ?? p.photos[0];
  const maxYear = Math.max(1, ...p.years.map(y => y.approved ?? y.requested));
  const pill = (bg: string, fg: string, t: string) => <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide" style={{ backgroundColor: bg, color: fg }}>{t}</span>;

  return (
    <article className="space-y-10 pb-12">
      <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
        <Link href={`/${town.slug}/capital`} className="hover:underline" style={{ color }}>← Capital Projects</Link>
        <span className="mx-2 text-gray-300">/</span><span className="font-mono">{p.code}</span>
      </nav>

      <header className="grid lg:grid-cols-5 gap-8 items-start">
        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {funded ? pill("#d1fae5", "#065f46", "Funded") : pill("#e5e7eb", "#4b5563", "Requested")}
            {funded && p.projectStatus !== "unreported" && pill("#eef2ff", "#3730a3", projectStatusLabel(p.projectStatus))}
            <span className="text-sm text-gray-500">{p.department}{p.category ? ` · ${p.category}` : ""}</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900" style={{ fontFamily: "var(--font-display)" }}>{p.title}</h1>
          {p.location && <p className="text-gray-500">{p.location}</p>}
          <div className="flex flex-wrap gap-x-10 gap-y-3 pt-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">{funded ? `FY${fundedYear?.fiscalYear} funded` : "Total requested"}</p>
              <p className="text-4xl font-bold tabular-nums" style={{ color }}>{$(funded && fundedYear ? (fundedYear.approved as number) : requestedTotal)}</p>
            </div>
            {funded && fundedYear && fundedYear.funding.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Paid for with</p>
                <p className="text-lg font-semibold text-gray-900">{fundedYear.funding.map(f => f.label).join(" + ")}</p>
              </div>
            )}
          </div>
          {funded && p.percentComplete !== null && !["not_started", "unreported"].includes(p.projectStatus) && (
            <div className="max-w-md pt-2">
              <div className="flex justify-between text-sm text-gray-600 mb-1"><span>{projectStatusLabel(p.projectStatus)}</span><span className="tabular-nums">{p.percentComplete}% complete</span></div>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden" role="img" aria-label={`${p.percentComplete}% complete`}><div className="h-full rounded-full" style={{ width: `${p.percentComplete}%`, backgroundColor: color }} /></div>
            </div>
          )}
        </div>
        <div className="lg:col-span-2">
          {primary ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/capital/files/${primary.id}`} alt={primary.caption || p.title} className="w-full aspect-[4/3] object-cover rounded-2xl border border-gray-200" />
          ) : (
            <div className="w-full aspect-[4/3] rounded-2xl border border-gray-200 flex items-center justify-center text-gray-300 text-sm" style={{ backgroundColor: color + "0d" }}>Photo coming soon</div>
          )}
          {primary?.caption && <p className="text-xs text-gray-500 mt-1">{primary.caption}</p>}
        </div>
      </header>

      {p.description && (
        <section aria-labelledby="about"><h2 id="about" className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">About this project</h2>
          <p className="text-lg text-gray-800 leading-relaxed max-w-3xl whitespace-pre-line">{p.description}</p></section>
      )}

      <section aria-labelledby="timeline">
        <h2 id="timeline" className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Funding by fiscal year</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {p.years.map(y => {
            const amt = y.approved ?? y.requested; const isF = y.approved !== null;
            return (
              <div key={y.fiscalYear} className="rounded-xl border p-3" style={{ borderColor: isF ? color : "#e5e7eb", backgroundColor: isF ? color + "12" : "#fff" }}>
                <p className="text-xs font-bold text-gray-500">FY{y.fiscalYear}</p>
                <p className={`text-lg font-bold tabular-nums ${amt ? "text-gray-900" : "text-gray-300"}`}>{amt ? $(amt) : "—"}</p>
                <div className="h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden" aria-hidden="true"><div className="h-full" style={{ width: `${(amt / maxYear) * 100}%`, backgroundColor: isF ? color : "#9ca3af" }} /></div>
                <p className="text-[11px] mt-1 font-semibold" style={{ color: isF ? color : "#9ca3af" }}>{isF ? "Funded" : amt ? "Requested" : ""}</p>
              </div>
            );
          })}
        </div>
        {fundedYear && fundedYear.funding.length > 0 && (
          <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-800 mb-2">How FY{fundedYear.fiscalYear} is paid for</p>
            <ul className="space-y-1.5">{fundedYear.funding.map(f => (
              <li key={f.label} className="flex items-center justify-between text-sm"><span className="text-gray-700">{f.label}</span><span className="font-semibold tabular-nums">{$(f.amount)}</span></li>
            ))}</ul>
          </div>
        )}
        {!funded && <p className="text-sm text-gray-500 mt-3">This is a department request under review. It is not a commitment of funds until approved by Town Meeting.</p>}
      </section>

      {funded && p.updates.length > 0 && (
        <section aria-labelledby="updates">
          <h2 id="updates" className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Project updates</h2>
          <ol className="space-y-4 border-l-2 pl-5 max-w-3xl" style={{ borderColor: color + "55" }}>
            {p.updates.map(u => (
              <li key={u.id}>
                <p className="text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString("en-US", { dateStyle: "long" })}{u.percentComplete !== null && !u.system ? ` · ${u.percentComplete}% complete` : ""} · {projectStatusLabel(u.status)}</p>
                <p className="text-gray-800">{u.note}</p>
              </li>
            ))}
          </ol>
          {p.completedOn && <p className="mt-3 text-sm text-gray-600">Completed {new Date(p.completedOn + "T12:00:00").toLocaleDateString("en-US", { dateStyle: "long" })}{p.actualCost !== null ? ` · final cost ${$(p.actualCost)}` : ""}</p>}
        </section>
      )}

      {answered.length > 0 && (
        <section aria-labelledby="why"><h2 id="why" className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Why it matters</h2>
          <dl className="grid md:grid-cols-2 gap-x-10 gap-y-6 max-w-5xl">{answered.map(([q, a]) => (
            <div key={q}><dt className="font-semibold text-gray-900">{q}</dt><dd className="text-gray-700 mt-1 leading-relaxed whitespace-pre-line">{a}</dd></div>
          ))}</dl>
        </section>
      )}

      {(p.costBreakdown.length > 0 || p.usefulLifeYears || p.operatingImpact !== null || p.grantEligible || prio) && (
        <section aria-labelledby="facts"><h2 id="facts" className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Project facts</h2>
          <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {prio && <div className="rounded-xl border border-gray-200 p-4"><dt className="text-xs text-gray-500">Department priority</dt><dd className="font-semibold text-gray-900">{prio.label}</dd></div>}
            {p.usefulLifeYears ? <div className="rounded-xl border border-gray-200 p-4"><dt className="text-xs text-gray-500">Expected useful life</dt><dd className="font-semibold text-gray-900">{p.usefulLifeYears} years</dd></div> : null}
            {p.operatingImpact !== null && <div className="rounded-xl border border-gray-200 p-4"><dt className="text-xs text-gray-500">Yearly operating {p.operatingImpact < 0 ? "savings" : "cost"}</dt><dd className="font-semibold text-gray-900 tabular-nums">{p.operatingImpact === 0 ? "None expected" : $(Math.abs(p.operatingImpact))}</dd></div>}
            {p.grantEligible && <div className="rounded-xl border border-gray-200 p-4"><dt className="text-xs text-gray-500">Outside funding</dt><dd className="font-semibold text-gray-900">May qualify for a grant</dd></div>}
          </dl>
          {p.costBreakdown.length > 0 && (
            <div className="mt-4 max-w-md"><p className="text-sm font-semibold text-gray-800 mb-1">What the cost includes</p>
              <ul className="text-sm divide-y divide-gray-100 border border-gray-200 rounded-xl">{p.costBreakdown.map((c, i) => <li key={i} className="flex justify-between px-4 py-2"><span>{c.label}</span><span className="tabular-nums font-medium">{$(c.amount)}</span></li>)}</ul></div>
          )}
        </section>
      )}

      {p.photos.length > 1 && (
        <section aria-labelledby="gallery"><h2 id="gallery" className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Photos</h2>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-3">{p.photos.map(ph => (
            <li key={ph.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/capital/files/${ph.id}`} alt={ph.caption || p.title} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl border border-gray-200" />
              {ph.caption && <p className="text-xs text-gray-500 mt-1">{ph.caption}</p>}
            </li>))}</ul>
        </section>
      )}

      {p.documents.length > 0 && (
        <section aria-labelledby="docs"><h2 id="docs" className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Documents</h2>
          <ul className="space-y-2">{p.documents.map(d => <li key={d.id}><a className="underline font-medium" style={{ color }} href={`/api/capital/files/${d.id}`} target="_blank" rel="noopener noreferrer">{d.caption || d.fileName}</a> <span className="text-xs text-gray-400">PDF · {Math.round(d.size / 1024)} KB</span></li>)}</ul>
        </section>
      )}
    </article>
  );
}
