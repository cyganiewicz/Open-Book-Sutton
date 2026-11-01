export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/capital/actor";
import { getProject } from "@/lib/capital/projects";
import { ESTIMATE_TYPES, PRIORITIES, fundingLabel } from "@/lib/capital/constants";
import { prisma } from "@/lib/db";
import PrintButton from "@/components/capital/PrintButton";

const $ = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString()}`);

// Printable "Project Detail Sheet" matching the layout of the Town's CIP manual.
export default async function CapitalSheet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/staff/login");
  const p = await getProject(actor, id).catch(() => null);
  if (!p) notFound();
  const town = await prisma.town.findUnique({ where: { id: actor.townId }, select: { name: true } });
  const photo = p.attachments.find(a => a.kind === "photo" && a.isPrimary) ?? p.attachments.find(a => a.kind === "photo");
  const prio = PRIORITIES.find(x => x.value === p.priority);
  const est = ESTIMATE_TYPES.find(e => e.key === p.estimateType)?.label;
  const yrs = p.years.filter(y => y.requestedAmount || y.approvedAmount);
  const qa: [string, string | null][] = [
    ["Why is this project important?", p.whyImportant], ["What alternatives are available?", p.alternatives], ["Who will be served?", p.whoServed],
    ["What is the projected life?", p.usefulLifeYears ? `${p.usefulLifeYears} years` : null], ["What are the consequences if not implemented?", p.consequences],
    ["What are the maintenance requirements?", p.maintenanceNeeds], ["How were the costs developed?", p.costBasis], ["What benefits will be derived?", p.benefits],
  ];
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <tr className="border border-gray-400"><th className="text-left align-top w-48 bg-gray-100 border-r border-gray-400 px-3 py-2 text-sm">{k}</th><td className="px-3 py-2 text-sm">{v || "—"}</td></tr>;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white text-gray-900">
      <style>{`@media print { body { background: #fff !important; } @page { margin: 0.6in; } }`}</style>
      <div className="flex justify-between items-start mb-6 print:hidden"><p className="text-sm text-gray-500">Preview of the Project Detail Sheet</p><PrintButton /></div>
      <p className="text-xs uppercase tracking-widest text-gray-500">{town?.name} · Capital Improvement Program FY{p.years[0]?.fiscalYear}–{p.years[p.years.length - 1]?.fiscalYear}</p>
      <h1 className="text-2xl font-bold mt-1">Project Detail Sheet</h1>
      <table className="w-full border-collapse mt-4">
        <tbody>
          <Row k="Project number" v={p.code} />
          <Row k="Project title" v={<strong>{p.title}</strong>} />
          <Row k="Department" v={p.departmentName} />
          <Row k="Category" v={p.category} />
          <Row k="Priority" v={prio ? `${prio.value}. ${prio.label}${p.deptRank ? ` (rank ${p.deptRank} within category)` : ""}` : null} />
          <Row k="Description and purpose" v={<span className="whitespace-pre-line">{p.description}</span>} />
          <Row k="Project picture" v={photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/capital/files/${photo.id}`} alt={photo.caption || p.title} className="max-h-64" /> : "No picture attached"} />
        </tbody>
      </table>
      <h2 className="text-lg font-bold mt-6 mb-2">Recommended financing</h2>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="bg-gray-100">{yrs.map(y => <th key={y.fiscalYear} className="border border-gray-400 px-2 py-1 text-right">FY{y.fiscalYear}</th>)}<th className="border border-gray-400 px-2 py-1 text-right">Total</th></tr></thead>
        <tbody><tr>{yrs.map(y => <td key={y.fiscalYear} className="border border-gray-400 px-2 py-1 text-right tabular-nums">{$(y.approvedAmount ?? y.requestedAmount)}{y.approvedAmount !== null && " ✓"}</td>)}<td className="border border-gray-400 px-2 py-1 text-right tabular-nums font-bold">{$(yrs.reduce((s, y) => s + (y.approvedAmount ?? y.requestedAmount), 0))}</td></tr></tbody>
      </table>
      <p className="text-xs text-gray-500 mt-1">✓ = funded</p>
      <table className="w-full border-collapse mt-3"><tbody>
        <Row k="Cost components" v={p.costBreakdown.length ? p.costBreakdown.map(c => `${c.label} ${$(c.amount)}`).join("; ") : null} />
        <Row k="Proposed financing" v={p.proposedFunding.map(fundingLabel).join(", ")} />
        <Row k="Estimate" v={[est, p.quoteDate ? `dated ${p.quoteDate}` : null].filter(Boolean).join(", ")} />
        <Row k="Grant eligibility" v={p.grantEligible ? `May be eligible. ${p.grantNotes ?? ""}` : "Not identified"} />
        <Row k="Annual maintenance / operating impact" v={p.operatingImpact === null ? null : `${$(p.operatingImpact)} per year${p.operatingImpactNotes ? ` — ${p.operatingImpactNotes}` : ""}`} />
      </tbody></table>
      <h2 className="text-lg font-bold mt-6 mb-2">Project questionnaire</h2>
      <table className="w-full border-collapse"><tbody>{qa.map(([q, a]) => <Row key={q} k={q} v={<span className="whitespace-pre-line">{a}</span>} />)}</tbody></table>
      <p className="text-xs text-gray-400 mt-6">Generated {new Date().toLocaleDateString("en-US", { dateStyle: "long" })} · {p.code} · Status: {p.requestStatus.replace("_", " ")}</p>
    </div>
  );
}
