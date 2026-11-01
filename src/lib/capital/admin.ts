// Administrator-only capital operations: setup, departments, who belongs where, importing the FY27 plan.

import { prisma } from "@/lib/db";
import { displayYears, parseCapitalSettings, type CapitalSettings } from "./constants";
import { analyze, type Analysis } from "./scoring";
import { CapitalError, loadAnalysisProjects, loadCapitalSettings } from "./projects";
import { SEED_DEPARTMENTS, SEED_PROJECTS, SEED_REVIEW_NOTES } from "./seed-data";
import { inBackground, notifyAssigned } from "./notify";
import { appBaseUrl } from "@/lib/email";

export interface CapitalOverview {
  settings: CapitalSettings;
  planYears: string[];
  departments: { id: string; name: string; code: string; projectCount: number; members: { staffUserId: string; name: string; email: string }[] }[];
  staff: { id: string; name: string; email: string; department: string | null }[];
  counts: Record<string, number>;
  openChangeRequests: number;
  analysis: Analysis;
  seed: { total: number; imported: number; remaining: number };
}

export async function getCapitalOverview(townId: string): Promise<CapitalOverview> {
  const settings = await loadCapitalSettings(townId);
  const [depts, staff, grouped, changeReqs, projects, existing] = await Promise.all([
    prisma.capitalDepartment.findMany({
      where: { townId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { members: { include: { staffUser: { select: { id: true, name: true, email: true } } } }, _count: { select: { projects: true } } },
    }),
    prisma.staffUser.findMany({ where: { townId }, select: { id: true, name: true, email: true, department: true }, orderBy: { name: "asc" } }),
    prisma.capitalProject.groupBy({ by: ["requestStatus"], where: { townId }, _count: true }),
    prisma.capitalComment.count({ where: { kind: "change_request", resolved: false, project: { townId } } }),
    loadAnalysisProjects(townId, settings),
    prisma.capitalProject.findMany({ where: { townId, code: { in: SEED_PROJECTS.map(s => s.code) } }, select: { code: true } }),
  ]);
  return {
    settings, planYears: displayYears(settings),
    departments: depts.map(d => ({
      id: d.id, name: d.name, code: d.code, projectCount: d._count.projects,
      members: d.members.map(m => ({ staffUserId: m.staffUser.id, name: m.staffUser.name, email: m.staffUser.email })),
    })),
    staff,
    counts: Object.fromEntries(grouped.map(g => [g.requestStatus, g._count])),
    openChangeRequests: changeReqs,
    analysis: analyze(projects, settings),
    seed: { total: SEED_PROJECTS.length, imported: existing.length, remaining: SEED_PROJECTS.length - existing.length },
  };
}

export async function saveCapitalSettings(townId: string, input: Partial<CapitalSettings>) {
  const current = await loadCapitalSettings(townId);
  const merged = parseCapitalSettings(JSON.stringify({ ...current, ...input }));
  await prisma.town.update({ where: { id: townId }, data: { capitalSettings: JSON.stringify(merged) } });
  return merged;
}

export async function saveDepartment(townId: string, d: { id?: string; name: string; code: string }) {
  const name = d.name.trim(), code = d.code.trim().toUpperCase();
  if (name.length < 2) throw new CapitalError("Enter a department name.");
  if (!/^[A-Z]{2,5}$/.test(code)) throw new CapitalError("The code must be 2–5 letters (it appears in project numbers, e.g. CIP-HWY-001).");
  const clash = await prisma.capitalDepartment.findFirst({ where: { townId, OR: [{ name }, { code }], NOT: d.id ? { id: d.id } : undefined } });
  if (clash) throw new CapitalError("Another department already uses that name or code.");
  if (d.id) {
    const cur = await prisma.capitalDepartment.findFirst({ where: { id: d.id, townId }, include: { _count: { select: { projects: true } } } });
    if (!cur) throw new CapitalError("Department not found.", 404);
    if (cur._count.projects > 0 && cur.code !== code) throw new CapitalError("The code can't change after the department has projects, because project numbers use it.");
    return prisma.capitalDepartment.update({ where: { id: d.id }, data: { name, code } });
  }
  return prisma.capitalDepartment.create({ data: { townId, name, code } });
}

export async function deleteDepartment(townId: string, id: string) {
  const d = await prisma.capitalDepartment.findFirst({ where: { id, townId }, include: { _count: { select: { projects: true } } } });
  if (!d) throw new CapitalError("Department not found.", 404);
  if (d._count.projects > 0) throw new CapitalError("This department still has projects. Move or delete them first.");
  await prisma.capitalDepartment.delete({ where: { id } });
}

export async function setDepartmentMembers(townId: string, departmentId: string, staffUserIds: string[]) {
  const dept = await prisma.capitalDepartment.findFirst({ where: { id: departmentId, townId } });
  if (!dept) throw new CapitalError("Department not found.", 404);
  const valid = await prisma.staffUser.findMany({ where: { townId, id: { in: staffUserIds } }, select: { id: true } });
  const before = new Set((await prisma.capitalDepartmentMember.findMany({ where: { departmentId }, select: { staffUserId: true } })).map(m => m.staffUserId));
  await prisma.$transaction([
    prisma.capitalDepartmentMember.deleteMany({ where: { departmentId } }),
    prisma.capitalDepartmentMember.createMany({ data: valid.map(v => ({ departmentId, staffUserId: v.id })) }),
  ]);
  // Let newly added people know
  const base = await appBaseUrl();
  for (const v of valid) if (!before.has(v.id)) inBackground(notifyAssigned(v.id, dept.name, base));
}

export async function bulkPublish(townId: string, statuses: string[], isPublic: boolean) {
  const r = await prisma.capitalProject.updateMany({ where: { townId, requestStatus: { in: statuses } }, data: { isPublic } });
  return r.count;
}

// ── Import of the FY2027 approved plan + FY2027–32 requests ─────────────────

export async function previewSeed(townId: string) {
  const existing = new Set((await prisma.capitalProject.findMany({ where: { townId }, select: { code: true } })).map(p => p.code));
  const fresh = SEED_PROJECTS.filter(p => !existing.has(p.code));
  const years = ["2027", "2028", "2029", "2030", "2031", "2032"];
  const depts = new Set((await prisma.capitalDepartment.findMany({ where: { townId }, select: { name: true } })).map(d => d.name));
  return {
    total: SEED_PROJECTS.length, newCount: fresh.length, alreadyImported: SEED_PROJECTS.length - fresh.length,
    newDepartments: SEED_DEPARTMENTS.filter(d => !depts.has(d.name)).map(d => d.name),
    funded: { count: fresh.filter(p => p.approved).length, amount: fresh.reduce((s, p) => s + (p.approved?.amount ?? 0), 0) },
    requestedByYear: Object.fromEntries(years.map(y => [y, fresh.reduce((s, p) => s + (p.requested[y] ?? 0), 0)])),
    notFunded: fresh.filter(p => p.requestStatus === "not_funded").length,
    reviewNotes: SEED_REVIEW_NOTES,
  };
}

export async function commitSeed(townId: string, importedBy: string) {
  const existing = new Set((await prisma.capitalProject.findMany({ where: { townId }, select: { code: true } })).map(p => p.code));
  const fresh = SEED_PROJECTS.filter(p => !existing.has(p.code));
  if (!fresh.length) return { created: 0 };

  const deptIds = new Map<string, string>();
  for (const d of SEED_DEPARTMENTS) {
    const found = await prisma.capitalDepartment.findFirst({ where: { townId, OR: [{ name: d.name }, { code: d.code }] } });
    deptIds.set(d.name, found?.id ?? (await prisma.capitalDepartment.create({ data: { townId, name: d.name, code: d.code, sortOrder: deptIds.size } })).id);
  }

  await prisma.$transaction(async tx => {
    for (const p of fresh) {
      const seedYears = [...new Set([...Object.keys(p.requested), ...(p.approved ? [p.approved.fiscalYear] : [])])].sort();
      const yearRows = seedYears.flatMap(fy => {
        const requested = p.requested[fy] ?? 0;
        const appr = p.approved && p.approved.fiscalYear === fy ? p.approved : null;
        if (!requested && !appr) return [];
        return [{
          fiscalYear: fy, requestedAmount: requested,
          approvedAmount: appr ? appr.amount : null, fundingSplit: JSON.stringify(appr ? appr.funding : {}),
          notes: appr ? p.notes.find(n => n.startsWith("FY2027 request")) ?? null : null,
        }];
      });
      const created = await tx.capitalProject.create({
        data: {
          townId, code: p.code, departmentId: deptIds.get(p.department)!, title: p.title, category: p.category,
          requestStatus: p.requestStatus, approvedFY: p.approved?.fiscalYear ?? null, isPublic: !!p.approved,
          createdByName: `Imported by ${importedBy}`, years: { create: yearRows },
        },
      });
      for (const n of p.notes) {
        await tx.capitalComment.create({ data: { projectId: created.id, kind: "admin_note", body: `Import note: ${n}`, authorName: importedBy, authorRole: "admin" } });
      }
      if (p.approved) {
        await tx.capitalStatusUpdate.create({
          data: { projectId: created.id, status: "not_started", authorName: importedBy, authorRole: "system",
            note: `Funded in the FY${p.approved.fiscalYear} capital budget: $${p.approved.amount.toLocaleString()}.` },
        });
      }
    }
  }, { timeout: 60000, maxWait: 10000 });
  return { created: fresh.length };
}
