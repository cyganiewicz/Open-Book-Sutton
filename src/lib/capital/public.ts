// What residents may see about capital projects. Every query is limited to isPublic projects
// and to explicit, safe columns (no evaluation scores, no admin notes, no private documents).

import { prisma } from "@/lib/db";
import { fundingLabel, parseCapitalSettings, planYears, type CapitalSettings } from "./constants";

const json = <T,>(s: string | null | undefined, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };

export interface PublicYear { fiscalYear: string; requested: number; approved: number | null; funding: { label: string; amount: number }[] }
export interface PublicSummary {
  id: string; code: string; title: string; department: string; category: string | null; description: string | null;
  funded: boolean; requestStatus: string; projectStatus: string; percentComplete: number | null; statusSummary: string | null;
  years: PublicYear[]; photoId: string | null;
}
export interface PublicDetail extends PublicSummary {
  location: string | null; priority: number | null;
  whyImportant: string | null; alternatives: string | null; whoServed: string | null; usefulLifeYears: number | null;
  consequences: string | null; maintenanceNeeds: string | null; costBasis: string | null; benefits: string | null;
  grantEligible: boolean; grantNotes: string | null; operatingImpact: number | null; operatingImpactNotes: string | null;
  costBreakdown: { label: string; amount: number }[]; proposedFunding: string[];
  actualCost: number | null; completedOn: string | null; statusUpdatedAt: string | null;
  updates: { id: string; status: string; percentComplete: number | null; note: string; createdAt: string; system: boolean }[];
  photos: { id: string; caption: string | null; isPrimary: boolean }[];
  documents: { id: string; fileName: string; caption: string | null; size: number }[];
}

const publicSelect = {
  id: true, code: true, title: true, description: true, category: true, requestStatus: true, projectStatus: true,
  percentComplete: true, statusSummary: true, location: true, priority: true, whyImportant: true, alternatives: true,
  whoServed: true, usefulLifeYears: true, consequences: true, maintenanceNeeds: true, costBasis: true, benefits: true,
  grantEligible: true, grantNotes: true, operatingImpact: true, operatingImpactNotes: true, costBreakdown: true,
  proposedFunding: true, actualCost: true, completedOn: true, statusUpdatedAt: true,
  department: { select: { name: true } },
  years: { select: { fiscalYear: true, requestedAmount: true, approvedAmount: true, fundingSplit: true } },
  attachments: { where: { isPublic: true }, orderBy: { createdAt: "asc" as const }, select: { id: true, kind: true, fileName: true, caption: true, isPrimary: true, size: true } },
  updates: { orderBy: { createdAt: "desc" as const }, select: { id: true, status: true, percentComplete: true, note: true, createdAt: true, authorRole: true } },
};
type Row = Awaited<ReturnType<typeof fetchRows>>[number];
const fetchRows = (townId: string, where: object = {}) =>
  prisma.capitalProject.findMany({ where: { townId, isPublic: true, requestStatus: { notIn: ["withdrawn", "deferred"] }, ...where }, select: publicSelect, orderBy: { code: "asc" } });

function summarize(p: Row): PublicSummary {
  const photos = p.attachments.filter(a => a.kind === "photo");
  return {
    id: p.id, code: p.code, title: p.title, department: p.department.name, category: p.category, description: p.description,
    funded: p.requestStatus === "approved", requestStatus: p.requestStatus, projectStatus: p.projectStatus,
    percentComplete: p.percentComplete, statusSummary: p.statusSummary,
    years: p.years.map(y => ({
      fiscalYear: y.fiscalYear, requested: y.requestedAmount, approved: y.approvedAmount,
      funding: Object.entries(json<Record<string, number>>(y.fundingSplit, {})).map(([k, v]) => ({ label: fundingLabel(k), amount: v })),
    })).sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear)),
    photoId: (photos.find(a => a.isPrimary) ?? photos[0])?.id ?? null,
  };
}

export async function getPublicPlan(townId: string): Promise<{ settings: CapitalSettings; years: string[]; projects: PublicSummary[] }> {
  const t = await prisma.town.findUnique({ where: { id: townId }, select: { capitalSettings: true } });
  const settings = parseCapitalSettings(t?.capitalSettings);
  const rows = await fetchRows(townId);
  return { settings, years: planYears(settings), projects: rows.map(summarize) };
}

export async function getPublicProject(townId: string, code: string): Promise<PublicDetail | null> {
  const rows = await fetchRows(townId, { code });
  const p = rows[0];
  if (!p) return null;
  return {
    ...summarize(p),
    location: p.location, priority: p.priority, whyImportant: p.whyImportant, alternatives: p.alternatives, whoServed: p.whoServed,
    usefulLifeYears: p.usefulLifeYears, consequences: p.consequences, maintenanceNeeds: p.maintenanceNeeds, costBasis: p.costBasis,
    benefits: p.benefits, grantEligible: p.grantEligible, grantNotes: p.grantNotes, operatingImpact: p.operatingImpact,
    operatingImpactNotes: p.operatingImpactNotes, costBreakdown: json(p.costBreakdown, []), proposedFunding: json(p.proposedFunding, []),
    actualCost: p.actualCost, completedOn: p.completedOn ? p.completedOn.toISOString().slice(0, 10) : null,
    statusUpdatedAt: p.statusUpdatedAt ? p.statusUpdatedAt.toISOString() : null,
    updates: p.updates.map(u => ({ id: u.id, status: u.status, percentComplete: u.percentComplete, note: u.note, createdAt: u.createdAt.toISOString(), system: u.authorRole === "system" })),
    photos: p.attachments.filter(a => a.kind === "photo").map(a => ({ id: a.id, caption: a.caption, isPrimary: a.isPrimary })),
    documents: p.attachments.filter(a => a.kind !== "photo").map(a => ({ id: a.id, fileName: a.fileName, caption: a.caption, size: a.size })),
  };
}
