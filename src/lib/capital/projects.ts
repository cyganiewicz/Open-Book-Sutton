// Database layer for capital projects. Every write goes through capabilitiesFor(),
// so permissions are enforced here on the server no matter what the browser sends.

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  CATEGORIES, ESTIMATE_TYPES, FUNDING_SOURCES, PROJECT_STATUSES, REQUEST_STATUSES, fundingLabel,
  parseCapitalSettings, planYears, type CapitalSettings,
} from "./constants";
import { capabilitiesFor, filterFieldPatch, isFunded, type Actor, type Capabilities } from "./permissions";
import { compositeScore, effectivePriority, readiness, type ScoreResult } from "./scoring";

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface YearDTO {
  fiscalYear: string; requestedAmount: number; recommendedAmount: number | null;
  approvedAmount: number | null; fundingSplit: Record<string, number>; notes: string | null;
}
export interface AttachmentDTO {
  id: string; kind: string; fileName: string; contentType: string; size: number; caption: string | null;
  isPrimary: boolean; isPublic: boolean; uploadedByName: string; createdAt: string;
}
export interface UpdateDTO { id: string; status: string; percentComplete: number | null; note: string; authorName: string; authorRole: string; createdAt: string }
export interface CommentDTO { id: string; kind: string; body: string; authorName: string; authorRole: string; resolved: boolean; createdAt: string }

export interface ProjectDTO {
  id: string; code: string; departmentId: string; departmentName: string;
  title: string; description: string | null; location: string | null; category: string | null;
  priority: number | null; deptRank: number | null;
  whyImportant: string | null; alternatives: string | null; whoServed: string | null; usersServed: number | null;
  usefulLifeYears: number | null; consequences: string | null; maintenanceNeeds: string | null; costBasis: string | null; benefits: string | null;
  estimateType: string | null; quoteDate: string | null; grantEligible: boolean; grantNotes: string | null;
  operatingImpact: number | null; operatingImpactNotes: string | null;
  costBreakdown: { label: string; amount: number }[]; proposedFunding: string[]; firstRequestedFY: string | null;
  requestStatus: string; approvedFY: string | null; isPublic: boolean; submittedAt: string | null;
  projectStatus: string; percentComplete: number | null; statusSummary: string | null; statusUpdatedAt: string | null;
  actualCost: number | null; completedOn: string | null;
  years: YearDTO[]; attachments: AttachmentDTO[]; updates: UpdateDTO[]; comments: CommentDTO[];
  readiness: { score: number; items: { key: string; label: string; points: number; done: boolean }[] };
  evaluation: { scores: Record<string, number>; notes: string | null; priorityOverride: number | null; composite: ScoreResult } | null;
  caps: Capabilities; updatedAt: string; createdByName: string | null;
}

export class CapitalError extends Error {
  constructor(message: string, public status = 400, public details?: string[]) { super(message); }
}

const json = <T,>(s: string | null | undefined, fallback: T): T => { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };

// Fields that only an administrator may write
export const ADMIN_ONLY_FIELDS = ["evalScores", "evalNotes", "evalPriorityOverride", "isPublic", "requestStatus", "departmentId", "firstRequestedFY"] as const;

// ── Settings / actor helpers ─────────────────────────────────────────────────

export async function loadCapitalSettings(townId: string): Promise<CapitalSettings> {
  const t = await prisma.town.findUnique({ where: { id: townId }, select: { capitalSettings: true } });
  return parseCapitalSettings(t?.capitalSettings);
}

const projectInclude = {
  department: { select: { id: true, name: true, code: true } },
  years: true,
  updates: { orderBy: { createdAt: "desc" as const } },
  comments: { orderBy: { createdAt: "asc" as const } },
  attachments: {
    orderBy: { createdAt: "asc" as const },
    select: { id: true, kind: true, fileName: true, contentType: true, size: true, caption: true, isPrimary: true, isPublic: true, uploadedByName: true, createdAt: true },
  },
};
type LoadedProject = NonNullable<Awaited<ReturnType<typeof loadProject>>>;

async function loadProject(id: string) {
  return prisma.capitalProject.findUnique({ where: { id }, include: projectInclude });
}

async function loadForActor(actor: Actor, id: string) {
  const p = await loadProject(id);
  if (!p || p.townId !== actor.townId) throw new CapitalError("Project not found.", 404);
  const settings = await loadCapitalSettings(actor.townId);
  const caps = capabilitiesFor(actor, { departmentId: p.departmentId, requestStatus: p.requestStatus, years: p.years }, settings);
  if (!caps.canView) throw new CapitalError("Project not found.", 404); // don't reveal other departments' projects
  return { p, settings, caps };
}

export function toDTO(p: LoadedProject, actor: Actor, caps: Capabilities, settings: CapitalSettings): ProjectDTO {
  const isAdmin = actor.kind === "admin";
  const showRecommended = isAdmin || ["recommended", "approved"].includes(p.requestStatus);
  const yearsList = planYears(settings);
  const byYear = new Map(p.years.map(y => [y.fiscalYear, y]));
  const allYears = [...new Set([...yearsList, ...p.years.map(y => y.fiscalYear)])].sort();
  const years: YearDTO[] = allYears.map(fy => {
    const y = byYear.get(fy);
    return {
      fiscalYear: fy, requestedAmount: y?.requestedAmount ?? 0,
      recommendedAmount: showRecommended ? y?.recommendedAmount ?? null : null,
      approvedAmount: y?.approvedAmount ?? null, fundingSplit: json(y?.fundingSplit, {}), notes: y?.notes ?? null,
    };
  });
  const r = readiness({
    description: p.description, priority: p.priority, costBasis: p.costBasis, estimateType: p.estimateType,
    usefulLifeYears: p.usefulLifeYears, operatingImpact: p.operatingImpact, whyImportant: p.whyImportant,
    alternatives: p.alternatives, whoServed: p.whoServed, consequences: p.consequences, benefits: p.benefits,
    maintenanceNeeds: p.maintenanceNeeds, years,
    hasPhoto: p.attachments.some(a => a.kind === "photo"), hasQuote: p.attachments.some(a => a.kind === "quote"),
  });
  const scores = json<Record<string, number>>(p.evalScores, {});
  return {
    id: p.id, code: p.code, departmentId: p.departmentId, departmentName: p.department.name,
    title: p.title, description: p.description, location: p.location, category: p.category,
    priority: p.priority, deptRank: p.deptRank,
    whyImportant: p.whyImportant, alternatives: p.alternatives, whoServed: p.whoServed, usersServed: p.usersServed,
    usefulLifeYears: p.usefulLifeYears, consequences: p.consequences, maintenanceNeeds: p.maintenanceNeeds,
    costBasis: p.costBasis, benefits: p.benefits, estimateType: p.estimateType,
    quoteDate: p.quoteDate ? p.quoteDate.toISOString().slice(0, 10) : null,
    grantEligible: p.grantEligible, grantNotes: p.grantNotes, operatingImpact: p.operatingImpact,
    operatingImpactNotes: p.operatingImpactNotes, costBreakdown: json(p.costBreakdown, []),
    proposedFunding: json(p.proposedFunding, []), firstRequestedFY: p.firstRequestedFY,
    requestStatus: p.requestStatus, approvedFY: p.approvedFY, isPublic: p.isPublic,
    submittedAt: p.submittedAt ? p.submittedAt.toISOString() : null,
    projectStatus: p.projectStatus, percentComplete: p.percentComplete, statusSummary: p.statusSummary,
    statusUpdatedAt: p.statusUpdatedAt ? p.statusUpdatedAt.toISOString() : null,
    actualCost: p.actualCost, completedOn: p.completedOn ? p.completedOn.toISOString().slice(0, 10) : null,
    years,
    attachments: p.attachments.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })),
    updates: p.updates.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })),
    comments: p.comments.filter(c => isAdmin || c.kind !== "admin_note").map(c => ({ ...c, createdAt: c.createdAt.toISOString() })),
    readiness: r,
    evaluation: isAdmin ? {
      scores, notes: p.evalNotes, priorityOverride: p.evalPriorityOverride,
      composite: compositeScore({ priority: effectivePriority(p.priority, p.evalPriorityOverride), scores, readiness: r.score, weights: settings.weights }),
    } : null,
    caps, updatedAt: p.updatedAt.toISOString(), createdByName: p.createdByName,
  };
}

// ── Reading ──────────────────────────────────────────────────────────────────

export async function getProject(actor: Actor, id: string): Promise<ProjectDTO> {
  const { p, settings, caps } = await loadForActor(actor, id);
  return toDTO(p, actor, caps, settings);
}

export interface ProjectRow {
  id: string; code: string; title: string; departmentId: string; departmentName: string; category: string | null;
  priority: number | null; requestStatus: string; projectStatus: string; percentComplete: number | null; isPublic: boolean;
  years: { fiscalYear: string; requestedAmount: number; recommendedAmount: number | null; approvedAmount: number | null }[];
  readiness: number; composite: number | null; operatingImpact: number | null; hasPhoto: boolean; openChangeRequests: number; updatedAt: string;
}

export async function listProjects(actor: Actor): Promise<{ rows: ProjectRow[]; settings: CapitalSettings }> {
  const settings = await loadCapitalSettings(actor.townId);
  const where = actor.kind === "admin" ? { townId: actor.townId } : { townId: actor.townId, departmentId: { in: actor.departmentIds } };
  const ps = await prisma.capitalProject.findMany({ where, include: projectInclude, orderBy: [{ code: "asc" }] });
  const rows = ps.map(p => {
    const dto = toDTO(p, actor, capabilitiesFor(actor, { departmentId: p.departmentId, requestStatus: p.requestStatus, years: p.years }, settings), settings);
    return {
      id: p.id, code: p.code, title: p.title, departmentId: p.departmentId, departmentName: p.department.name, category: p.category,
      priority: actor.kind === "admin" ? effectivePriority(p.priority, p.evalPriorityOverride) : p.priority,
      requestStatus: p.requestStatus, projectStatus: p.projectStatus, percentComplete: p.percentComplete, isPublic: p.isPublic,
      years: dto.years, readiness: dto.readiness.score, composite: dto.evaluation?.composite.score ?? null,
      operatingImpact: p.operatingImpact, hasPhoto: p.attachments.some(a => a.kind === "photo"),
      openChangeRequests: p.comments.filter(c => c.kind === "change_request" && !c.resolved).length,
      updatedAt: p.updatedAt.toISOString(),
    };
  });
  return { rows, settings };
}

// ── Input cleaning ───────────────────────────────────────────────────────────

const TEXT_LIMITS: Record<string, number> = {
  title: 140, location: 200, grantNotes: 1000, operatingImpactNotes: 1000,
  description: 4000, whyImportant: 3000, alternatives: 3000, whoServed: 1500, consequences: 3000,
  maintenanceNeeds: 3000, costBasis: 3000, benefits: 3000, evalNotes: 5000,
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** Validates and coerces a patch of project fields. Throws CapitalError listing every problem. */
export function cleanFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const errs: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (k in TEXT_LIMITS) {
      const s = v === null ? "" : String(v).trim();
      if (s.length > TEXT_LIMITS[k]) errs.push(`${k} is too long (max ${TEXT_LIMITS[k]} characters)`);
      else if (k === "title" && s.length < 3) errs.push("Title must be at least 3 characters");
      else out[k] = k === "title" ? s : s || null;
    } else if (k === "category") {
      const s = v ? String(v).trim() : "";
      out[k] = s ? (CATEGORIES.includes(s) ? s : "Other") : null;
    } else if (k === "priority" || k === "evalPriorityOverride") {
      const n = num(v);
      if (n === null) out[k] = null; else if (!Number.isInteger(n) || n < 1 || n > 5) errs.push("Priority must be 1–5"); else out[k] = n;
    } else if (["deptRank", "usersServed", "usefulLifeYears"].includes(k)) {
      const n = num(v);
      if (n === null) out[k] = null; else if (!Number.isInteger(n) || n < 0 || n > 1_000_000) errs.push(`${k} must be a whole number`); else out[k] = n;
    } else if (k === "operatingImpact") {
      const n = num(v);
      if (n !== null && Number.isNaN(n)) errs.push("Operating impact must be a number"); else out[k] = n;
    } else if (k === "estimateType") {
      const s = v ? String(v) : "";
      out[k] = ESTIMATE_TYPES.some(e => e.key === s) ? s : null;
    } else if (k === "quoteDate") {
      const d = v ? new Date(String(v)) : null;
      if (d && isNaN(d.getTime())) errs.push("Quote date is not a valid date"); else out[k] = d;
    } else if (k === "grantEligible" || k === "isPublic") {
      out[k] = !!v;
    } else if (k === "costBreakdown") {
      const arr = Array.isArray(v) ? v : [];
      out[k] = JSON.stringify(arr.slice(0, 12).map(x => ({ label: String((x as { label?: unknown }).label ?? "").slice(0, 60), amount: Math.max(0, num((x as { amount?: unknown }).amount) || 0) })).filter(x => x.label || x.amount));
    } else if (k === "proposedFunding") {
      const arr = Array.isArray(v) ? v.map(String) : [];
      out[k] = JSON.stringify([...new Set(arr.filter(a => FUNDING_SOURCES.some(f => f.key === a)))]);
    } else if (k === "evalScores") {
      const o: Record<string, number> = {};
      for (const [ck, cv] of Object.entries((v ?? {}) as Record<string, unknown>)) {
        const n = num(cv);
        if (n !== null && !Number.isNaN(n)) o[ck] = Math.max(0, Math.min(5, n));
      }
      out[k] = JSON.stringify(o);
    } else if (k === "requestStatus") {
      if (!REQUEST_STATUSES.some(s => s.key === v)) errs.push("Unknown status"); else out[k] = v;
    } else if (k === "firstRequestedFY") {
      out[k] = v && /^\d{4}$/.test(String(v)) ? String(v) : null;
    } else if (k === "departmentId") {
      out[k] = String(v);
    }
    // anything else is ignored: unknown keys can never reach the database
  }
  if (errs.length) throw new CapitalError("Please fix the highlighted fields.", 400, errs);
  return out;
}

interface YearPatch { requestedAmount?: unknown; recommendedAmount?: unknown; notes?: unknown }

function cleanYear(raw: YearPatch, isAdmin: boolean): { requestedAmount?: number; recommendedAmount?: number | null; notes?: string | null } {
  const out: { requestedAmount?: number; recommendedAmount?: number | null; notes?: string | null } = {};
  if (raw.requestedAmount !== undefined) {
    const n = num(raw.requestedAmount);
    if (n === null) out.requestedAmount = 0;
    else if (Number.isNaN(n) || n < 0 || n > 1_000_000_000) throw new CapitalError("Amounts must be numbers between $0 and $1,000,000,000.");
    else out.requestedAmount = n;
  }
  if (isAdmin && raw.recommendedAmount !== undefined) {
    const n = num(raw.recommendedAmount);
    if (n !== null && (Number.isNaN(n) || n < 0 || n > 1_000_000_000)) throw new CapitalError("Recommended amounts must be numbers.");
    out.recommendedAmount = n;
  }
  if (raw.notes !== undefined) out.notes = raw.notes ? String(raw.notes).trim().slice(0, 1000) || null : null;
  return out;
}

// ── Create / update / delete ─────────────────────────────────────────────────

async function nextCode(townId: string, deptCode: string): Promise<string> {
  const prefix = `CIP-${deptCode}-`;
  const existing = await prisma.capitalProject.findMany({ where: { townId, code: { startsWith: prefix } }, select: { code: true } });
  const max = existing.reduce((m, c) => Math.max(m, parseInt(c.code.slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export async function createProject(actor: Actor, input: { departmentId: string; fields?: Record<string, unknown>; years?: Record<string, YearPatch> }): Promise<ProjectDTO> {
  const settings = await loadCapitalSettings(actor.townId);
  const dept = await prisma.capitalDepartment.findFirst({ where: { id: input.departmentId, townId: actor.townId } });
  if (!dept) throw new CapitalError("Department not found.", 404);
  if (actor.kind === "staff" && !actor.departmentIds.includes(dept.id)) throw new CapitalError("You can only add projects for your own department.", 403);
  const caps = capabilitiesFor(actor, null, settings);
  if (!caps.canEditFields) throw new CapitalError(caps.readOnlyReason ?? "You can't add projects right now.", 403);

  const { allowed } = filterFieldPatch(input.fields ?? {}, caps, ADMIN_ONLY_FIELDS);
  const fields = cleanFields({ title: "Untitled project", ...allowed });
  const yearRows: { fiscalYear: string; requestedAmount: number; notes: string | null }[] = [];
  for (const [fy, raw] of Object.entries(input.years ?? {})) {
    if (!caps.editableYears.includes(fy)) continue;
    const c = cleanYear(raw, false);
    if (c.requestedAmount !== undefined) yearRows.push({ fiscalYear: fy, requestedAmount: c.requestedAmount, notes: c.notes ?? null });
  }
  const code = await nextCode(actor.townId, dept.code);
  const first = yearRows.find(y => y.requestedAmount > 0)?.fiscalYear ?? null;
  const data: Prisma.CapitalProjectUncheckedCreateInput = {
    ...(fields as Partial<Prisma.CapitalProjectUncheckedCreateInput>),
    title: String(fields.title ?? "Untitled project"),
    townId: actor.townId, departmentId: dept.id, code, createdByName: actor.name, firstRequestedFY: first,
    years: { create: yearRows },
  };
  const created = await prisma.capitalProject.create({ data });
  return getProject(actor, created.id);
}

export async function updateProject(
  actor: Actor, id: string, body: { fields?: Record<string, unknown>; years?: Record<string, YearPatch> }
): Promise<{ project: ProjectDTO; refused: string[] }> {
  const { p, caps } = await loadForActor(actor, id);
  const isAdmin = actor.kind === "admin";
  const { allowed, refused } = filterFieldPatch(body.fields ?? {}, caps, ADMIN_ONLY_FIELDS);
  const data = cleanFields(allowed as Record<string, unknown>);

  const yearOps: { fiscalYear: string; patch: ReturnType<typeof cleanYear> }[] = [];
  for (const [fy, raw] of Object.entries(body.years ?? {})) {
    if (!/^\d{4}$/.test(fy)) continue;
    const allowedYear = caps.editableYears.includes(fy) || (isAdmin && p.years.some(y => y.fiscalYear === fy));
    if (!allowedYear) { refused.push(`FY${fy}`); continue; }
    yearOps.push({ fiscalYear: fy, patch: cleanYear(raw, isAdmin) });
  }
  if (!Object.keys(data).length && !yearOps.length) {
    if (refused.length) throw new CapitalError("Those changes aren't allowed on this project.", 403, refused);
    return { project: await getProject(actor, id), refused };
  }

  await prisma.$transaction(async tx => {
    if (Object.keys(data).length) await tx.capitalProject.update({ where: { id }, data: data as Record<string, never> });
    for (const op of yearOps) {
      await tx.capitalProjectYear.upsert({
        where: { projectId_fiscalYear: { projectId: id, fiscalYear: op.fiscalYear } },
        update: op.patch,
        create: { projectId: id, fiscalYear: op.fiscalYear, requestedAmount: 0, ...op.patch },
      });
    }
    if (!p.firstRequestedFY && yearOps.some(o => (o.patch.requestedAmount ?? 0) > 0)) {
      await tx.capitalProject.update({ where: { id }, data: { firstRequestedFY: yearOps.find(o => (o.patch.requestedAmount ?? 0) > 0)!.fiscalYear } });
    }
    await tx.capitalProject.update({ where: { id }, data: { updatedAt: new Date() } });
  });
  return { project: await getProject(actor, id), refused };
}

export async function deleteProject(actor: Actor, id: string) {
  const { caps } = await loadForActor(actor, id);
  if (!caps.canDelete) throw new CapitalError("Only draft requests can be deleted. Withdraw it instead.", 403);
  await prisma.capitalProject.delete({ where: { id } });
}

// ── Workflow actions ─────────────────────────────────────────────────────────

export type ActionName =
  | "submit" | "resubmit" | "withdraw" | "setRequestStatus" | "approveYear" | "unapproveYear" | "setPublic"
  | "evaluate" | "postStatus" | "comment" | "resolveComment";

function submitProblems(p: LoadedProject, settings: CapitalSettings): string[] {
  const probs: string[] = [];
  if (!p.title || p.title.trim().length < 3) probs.push("Add a project title.");
  if ((p.description ?? "").trim().length < 20) probs.push("Add a description and purpose (a short paragraph).");
  if (p.priority === null) probs.push("Choose a priority category (1–5).");
  const outer = p.years.filter(y => y.fiscalYear > settings.adoptedFY && y.requestedAmount > 0);
  if (!outer.length) probs.push(`Enter a cost for at least one year after FY${settings.adoptedFY}.`);
  return probs;
}

export async function performAction(actor: Actor, id: string, action: ActionName, payload: Record<string, unknown> = {}): Promise<ProjectDTO> {
  const { p, settings, caps } = await loadForActor(actor, id);
  const isAdmin = actor.kind === "admin";
  const role = isAdmin ? "admin" : "department";
  const need = (ok: boolean, msg = "You don't have permission to do that.") => { if (!ok) throw new CapitalError(msg, 403); };

  switch (action) {
    case "submit": case "resubmit": {
      need(action === "submit" ? caps.canSubmit : caps.canResubmit, caps.readOnlyReason ?? undefined);
      const probs = submitProblems(p, settings);
      if (probs.length) throw new CapitalError("This request isn't ready to submit yet.", 400, probs);
      await prisma.capitalProject.update({ where: { id }, data: { requestStatus: "submitted", submittedAt: new Date() } });
      break;
    }
    case "withdraw":
      need(caps.canWithdraw);
      await prisma.capitalProject.update({ where: { id }, data: { requestStatus: "withdrawn" } });
      break;

    case "setRequestStatus": {
      need(isAdmin);
      const status = String(payload.status);
      if (!REQUEST_STATUSES.some(s => s.key === status) || status === "approved") throw new CapitalError("Use “Fund this project” to approve a project.");
      if (isFunded({ departmentId: p.departmentId, requestStatus: p.requestStatus, years: p.years })) throw new CapitalError("This project is funded. Remove the approval first.");
      await prisma.capitalProject.update({ where: { id }, data: { requestStatus: status } });
      break;
    }
    case "approveYear": {
      need(isAdmin);
      const fy = String(payload.fiscalYear);
      if (!planYears(settings).includes(fy)) throw new CapitalError("That fiscal year isn't in the plan.");
      const amount = num(payload.amount);
      if (amount === null || Number.isNaN(amount) || amount <= 0) throw new CapitalError("Enter the approved amount.");
      const funding: Record<string, number> = {};
      for (const [k, v] of Object.entries((payload.funding ?? {}) as Record<string, unknown>)) {
        const n = num(v);
        if (n && n > 0) {
          if (!FUNDING_SOURCES.some(f => f.key === k)) throw new CapitalError(`Unknown funding source “${k}”.`);
          funding[k] = n;
        }
      }
      const sum = Object.values(funding).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - amount) > 0.01) throw new CapitalError(`Funding sources add up to $${sum.toLocaleString()} but the approved amount is $${amount.toLocaleString()}.`);
      await prisma.$transaction([
        prisma.capitalProjectYear.upsert({
          where: { projectId_fiscalYear: { projectId: id, fiscalYear: fy } },
          update: { approvedAmount: amount, fundingSplit: JSON.stringify(funding) },
          create: { projectId: id, fiscalYear: fy, requestedAmount: 0, approvedAmount: amount, fundingSplit: JSON.stringify(funding) },
        }),
        prisma.capitalProject.update({ where: { id }, data: { requestStatus: "approved", approvedFY: p.approvedFY && p.approvedFY < fy ? p.approvedFY : fy, isPublic: true } }),
        prisma.capitalStatusUpdate.create({
          data: { projectId: id, status: "not_started", note: `Funded in the FY${fy} capital budget: $${amount.toLocaleString()} (${Object.entries(funding).map(([k, v]) => `${fundingLabel(k)} $${v.toLocaleString()}`).join(", ")}).`, authorName: actor.name, authorRole: "system" },
        }),
      ]);
      break;
    }
    case "unapproveYear": {
      need(isAdmin);
      const fy = String(payload.fiscalYear);
      await prisma.capitalProjectYear.updateMany({ where: { projectId: id, fiscalYear: fy }, data: { approvedAmount: null, fundingSplit: "{}" } });
      const remaining = await prisma.capitalProjectYear.findMany({ where: { projectId: id, approvedAmount: { not: null } }, orderBy: { fiscalYear: "asc" } });
      await prisma.capitalProject.update({
        // Approval is what published it, so removing the last approval also takes it off the public site
        where: { id }, data: remaining.length ? { approvedFY: remaining[0].fiscalYear } : { approvedFY: null, requestStatus: "recommended", isPublic: false },
      });
      break;
    }
    case "setPublic":
      need(isAdmin);
      await prisma.capitalProject.update({ where: { id }, data: { isPublic: !!payload.isPublic } });
      break;

    case "evaluate": {
      need(caps.canEvaluate);
      const data = cleanFields({ evalScores: payload.scores, evalNotes: payload.notes, evalPriorityOverride: payload.priorityOverride });
      await prisma.capitalProject.update({ where: { id }, data: data as Record<string, never> });
      break;
    }
    case "postStatus": {
      need(caps.canPostStatus, "Status updates are for funded projects.");
      const status = String(payload.status);
      if (!PROJECT_STATUSES.some(s => s.key === status)) throw new CapitalError("Choose a project status.");
      const note = String(payload.note ?? "").trim();
      if (note.length < 3) throw new CapitalError("Add a short note about the status.");
      let pct = num(payload.percentComplete);
      if (pct !== null && (Number.isNaN(pct) || pct < 0 || pct > 100)) throw new CapitalError("Percent complete must be 0–100.");
      if (status === "complete") pct = 100;
      if (status === "not_started") pct = pct ?? 0;
      const actual = num(payload.actualCost);
      if (actual !== null && (Number.isNaN(actual) || actual < 0)) throw new CapitalError("Actual cost must be a number.");
      await prisma.$transaction([
        prisma.capitalStatusUpdate.create({ data: { projectId: id, status, percentComplete: pct === null ? null : Math.round(pct), note: note.slice(0, 2000), authorName: actor.name, authorRole: role } }),
        prisma.capitalProject.update({
          where: { id },
          data: {
            projectStatus: status, percentComplete: pct === null ? p.percentComplete : Math.round(pct), statusSummary: note.slice(0, 2000), statusUpdatedAt: new Date(),
            ...(actual !== null ? { actualCost: actual } : {}),
            ...(status === "complete" ? { completedOn: payload.completedOn ? new Date(String(payload.completedOn)) : new Date() } : {}),
          },
        }),
      ]);
      break;
    }
    case "comment": {
      const kind = String(payload.kind ?? "note");
      const body = String(payload.body ?? "").trim();
      if (body.length < 2) throw new CapitalError("Write a message first.");
      if (kind === "admin_note") need(isAdmin);
      else if (kind === "change_request") need(caps.canRequestChange, "Change requests are for funded projects.");
      else if (!["note"].includes(kind)) throw new CapitalError("Unknown comment type.");
      await prisma.capitalComment.create({ data: { projectId: id, kind, body: body.slice(0, 3000), authorName: actor.name, authorRole: role } });
      break;
    }
    case "resolveComment": {
      need(isAdmin);
      await prisma.capitalComment.updateMany({ where: { id: String(payload.commentId), projectId: id }, data: { resolved: payload.resolved !== false } });
      break;
    }
    default:
      throw new CapitalError("Unknown action.");
  }
  return getProject(actor, id);
}

// ── Files (photos, quotes, documents) ────────────────────────────────────────

const MAX_PHOTO = 4 * 1024 * 1024;
const MAX_DOC = 8 * 1024 * 1024;
const MAX_PHOTOS_PER_PROJECT = 12;
const MAX_DOCS_PER_PROJECT = 10;

/** Identify a file by its first bytes, never by what the browser claims */
export function sniffType(buf: Uint8Array): { type: string; isImage: boolean } | null {
  const h = (i: number) => buf[i];
  if (h(0) === 0xff && h(1) === 0xd8 && h(2) === 0xff) return { type: "image/jpeg", isImage: true };
  if (h(0) === 0x89 && h(1) === 0x50 && h(2) === 0x4e && h(3) === 0x47) return { type: "image/png", isImage: true };
  if (h(0) === 0x52 && h(1) === 0x49 && h(2) === 0x46 && h(3) === 0x46 && h(8) === 0x57 && h(9) === 0x45 && h(10) === 0x42 && h(11) === 0x50) return { type: "image/webp", isImage: true };
  if (h(0) === 0x25 && h(1) === 0x50 && h(2) === 0x44 && h(3) === 0x46) return { type: "application/pdf", isImage: false };
  return null;
}

export async function addAttachment(
  actor: Actor, projectId: string, f: { kind: string; fileName: string; data: Uint8Array; caption?: string | null }
): Promise<AttachmentDTO> {
  const { p, caps } = await loadForActor(actor, projectId);
  if (!caps.canUploadFiles) throw new CapitalError(caps.readOnlyReason ?? "You can't add files to this project.", 403);
  const sniffed = sniffType(f.data);
  if (!sniffed) throw new CapitalError("Only JPG, PNG, WebP images and PDF documents are allowed.");
  const kind = f.kind === "photo" ? "photo" : f.kind === "quote" ? "quote" : "document";
  if (kind === "photo" && !sniffed.isImage) throw new CapitalError("Photos must be JPG, PNG or WebP images.");
  if (kind !== "photo" && sniffed.type !== "application/pdf") throw new CapitalError("Quotes and documents must be PDF files.");
  if (f.data.length === 0) throw new CapitalError("That file is empty.");
  if (f.data.length > (kind === "photo" ? MAX_PHOTO : MAX_DOC)) throw new CapitalError(`That file is too large (max ${kind === "photo" ? "4 MB" : "8 MB"}).`);
  const counts = {
    photo: p.attachments.filter(a => a.kind === "photo").length,
    docs: p.attachments.filter(a => a.kind !== "photo").length,
  };
  if (kind === "photo" && counts.photo >= MAX_PHOTOS_PER_PROJECT) throw new CapitalError(`A project can have up to ${MAX_PHOTOS_PER_PROJECT} photos.`);
  if (kind !== "photo" && counts.docs >= MAX_DOCS_PER_PROJECT) throw new CapitalError(`A project can have up to ${MAX_DOCS_PER_PROJECT} documents.`);

  const fileName = f.fileName.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
  const created = await prisma.capitalAttachment.create({
    data: {
      id: randomUUID(), projectId, kind, fileName, contentType: sniffed.type, size: f.data.length, data: new Uint8Array(f.data),
      caption: f.caption?.trim().slice(0, 200) || null, isPrimary: kind === "photo" && counts.photo === 0,
      isPublic: kind === "photo", uploadedByName: actor.name,
    },
    select: { id: true, kind: true, fileName: true, contentType: true, size: true, caption: true, isPrimary: true, isPublic: true, uploadedByName: true, createdAt: true },
  });
  await prisma.capitalProject.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  return { ...created, createdAt: created.createdAt.toISOString() };
}

export async function updateAttachment(actor: Actor, attachmentId: string, patch: { caption?: unknown; isPrimary?: unknown; isPublic?: unknown }) {
  const a = await prisma.capitalAttachment.findUnique({ where: { id: attachmentId }, select: { id: true, projectId: true, kind: true } });
  if (!a) throw new CapitalError("File not found.", 404);
  const { caps } = await loadForActor(actor, a.projectId);
  if (!caps.canUploadFiles) throw new CapitalError("You can't change files on this project.", 403);
  const data: { caption?: string | null; isPrimary?: boolean; isPublic?: boolean } = {};
  if (patch.caption !== undefined) data.caption = patch.caption ? String(patch.caption).trim().slice(0, 200) : null;
  if (patch.isPublic !== undefined) data.isPublic = !!patch.isPublic;
  if (patch.isPrimary === true && a.kind === "photo") {
    await prisma.capitalAttachment.updateMany({ where: { projectId: a.projectId, kind: "photo" }, data: { isPrimary: false } });
    data.isPrimary = true;
  }
  await prisma.capitalAttachment.update({ where: { id: attachmentId }, data });
}

export async function deleteAttachment(actor: Actor, attachmentId: string) {
  const a = await prisma.capitalAttachment.findUnique({ where: { id: attachmentId }, select: { id: true, projectId: true, kind: true, isPrimary: true } });
  if (!a) throw new CapitalError("File not found.", 404);
  const { caps } = await loadForActor(actor, a.projectId);
  if (!caps.canUploadFiles) throw new CapitalError("You can't remove files from this project.", 403);
  await prisma.capitalAttachment.delete({ where: { id: attachmentId } });
  if (a.isPrimary) {
    const next = await prisma.capitalAttachment.findFirst({ where: { projectId: a.projectId, kind: "photo" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (next) await prisma.capitalAttachment.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
}

/** Returns the file only if the viewer is allowed to see it */
export async function getAttachmentForViewing(id: string, actor: Actor | null) {
  const a = await prisma.capitalAttachment.findUnique({
    where: { id },
    select: { fileName: true, contentType: true, data: true, isPublic: true, projectId: true, project: { select: { isPublic: true, townId: true, departmentId: true, requestStatus: true, years: { select: { fiscalYear: true, approvedAmount: true } } } } },
  });
  if (!a) return null;
  if (a.isPublic && a.project.isPublic) return { fileName: a.fileName, contentType: a.contentType, data: a.data, isPublicFile: true };
  if (!actor || actor.townId !== a.project.townId) return null;
  const settings = await loadCapitalSettings(a.project.townId);
  const caps = capabilitiesFor(actor, { departmentId: a.project.departmentId, requestStatus: a.project.requestStatus, years: a.project.years }, settings);
  return caps.canView ? { fileName: a.fileName, contentType: a.contentType, data: a.data, isPublicFile: false } : null;
}

// ── For portfolio analysis (admin) ───────────────────────────────────────────

import type { AnalysisProject } from "./scoring";

export async function loadAnalysisProjects(townId: string, settings: CapitalSettings): Promise<AnalysisProject[]> {
  const ps = await prisma.capitalProject.findMany({ where: { townId }, include: projectInclude });
  const admin: Actor = { kind: "admin", id: "system", name: "system", email: "", townId, departmentIds: [] };
  return ps.map(p => {
    const caps = capabilitiesFor(admin, { departmentId: p.departmentId, requestStatus: p.requestStatus, years: p.years }, settings);
    const dto = toDTO(p, admin, caps, settings);
    return {
      id: p.id, code: p.code, title: p.title, department: p.department.name, requestStatus: p.requestStatus,
      priority: effectivePriority(p.priority, p.evalPriorityOverride), operatingImpact: p.operatingImpact,
      readiness: dto.readiness.score, composite: dto.evaluation?.composite.score ?? null,
      years: dto.years.map(y => ({ fiscalYear: y.fiscalYear, requestedAmount: y.requestedAmount, recommendedAmount: y.recommendedAmount, approvedAmount: y.approvedAmount })),
    };
  });
}
