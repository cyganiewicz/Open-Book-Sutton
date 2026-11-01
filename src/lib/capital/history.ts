// Prior-year capital projects: import funded projects from earlier fiscal years so residents (and you)
// can look back. Sources: capital data already uploaded through Upload, or a spreadsheet.
// Rules: never duplicate; a repeat of an existing funded project (same department and title) adds the
// new funded year to that project instead of creating a second page.

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { FUNDING_SOURCES, isValidDecisionYear } from "./constants";
import { CapitalError, loadCapitalSettings } from "./projects";

export interface HistoryRow {
  rowNumber: number; fiscalYear: string; department: string; title: string; amount: number;
  funding: Record<string, number>; fundingNote: string | null; description: string | null; status: string | null;
}
export interface HistoryItem {
  row: HistoryRow; action: "create" | "add_year" | "skip"; reason: string | null;
  departmentId: string | null; targetProjectId: string | null; targetCode: string | null;
}
export interface HistoryPreview {
  totalRows: number; create: number; addYear: number; skip: number; amount: number;
  byYear: { fiscalYear: string; count: number; amount: number }[];
  newDepartments: string[]; errors: { row: number; reason: string }[]; warnings: string[];
  sample: { fiscalYear: string; department: string; title: string; amount: number; action: string; reason: string | null }[];
}

// ── Normalizing ──────────────────────────────────────────────────────────────

export const normalizeTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const SYNONYMS: [RegExp, string][] = [[/\bdpw\b/g, "public works"], [/\bhwy\b/g, "highway"], [/\bdept\b/g, "department"], [/&/g, " and "]];
const STOP = new Set(["department", "division", "dept", "town", "of", "the", "and", "-", "office"]);
function deptTokens(name: string): Set<string> {
  let s = name.toLowerCase();
  for (const [re, to] of SYNONYMS) s = s.replace(re, to);
  return new Set(s.replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(t => t && !STOP.has(t)));
}

/** Matches a spreadsheet's department name to an existing department (exact, or one unambiguous containment match) */
export function matchDepartment(name: string, existing: { id: string; name: string }[]): { id: string; name: string } | null {
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, " ").trim();
  const exact = existing.find(d => norm(d.name) === norm(name));
  if (exact) return exact;
  const t = deptTokens(name);
  if (t.size === 0) return null;
  const hits = existing.filter(d => { const e = deptTokens(d.name); return e.size > 0 && ([...t].every(x => e.has(x)) || [...e].every(x => t.has(x))); });
  return hits.length === 1 ? hits[0] : null;
}

export function matchFundingSource(label: string): string | null {
  const l = label.toLowerCase();
  if (!l.trim()) return null;
  if (/free\s*cash/.test(l)) return "free_cash";
  if (/stabiliz/.test(l)) return "cap_stab";
  if (/retained/.test(l)) return "ent_retained";
  if (/enterprise|sewer|water/.test(l) && /borrow|bond|debt|note/.test(l)) return "ent_borrowing";
  if (/borrow|bond|debt|note|loan/.test(l)) return "gf_borrowing";
  if (/grant|federal|state aid|chapter 90|mass ?works|reimburse/.test(l)) return "grant";
  if (/levy|operating|raise|appropriat|tax/.test(l)) return "tax_levy";
  if (/other available|revolving|special revenue|trust|gift|donation|perpetual|cemetery|receipts reserved/.test(l)) return "other_funds";
  return null;
}

function parseFiscalYear(v: unknown): string | null {
  const m = String(v ?? "").match(/(\d{4}|\d{2})\s*$/);
  if (!m) return null;
  return m[1].length === 2 ? String(2000 + Number(m[1])) : m[1];
}
function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v ?? "").trim(); if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[$,()\s-]/g, ""));
  return Number.isFinite(n) ? Math.round((neg ? -n : n) * 100) / 100 : null;
}
const STATUS_WORDS: [RegExp, string][] = [[/complete|done|finished/i, "complete"], [/in progress|ongoing|underway|under way/i, "in_progress"], [/cancel/i, "cancelled"], [/on hold|paused/i, "on_hold"], [/procure|bid/i, "procurement"], [/plan|design/i, "planning"]];
const mapStatus = (v: string | null) => { if (!v) return null; for (const [re, k] of STATUS_WORDS) if (re.test(v)) return k; return null; };

// ── Reading a spreadsheet ────────────────────────────────────────────────────

export const TEMPLATE_CSV = [
  ["Fiscal Year", "Department", "Project", "Amount", "Funding Source", "Description", "Status", ...FUNDING_SOURCES.map(f => f.label)].join(","),
  ["FY2025", "Police Department", "Police Cruiser Routine Replacement", "145000", "Free Cash", "Annual cruiser replacement", "Complete", ...FUNDING_SOURCES.map(() => "")].join(","),
  ["FY2025", "Public Works - Highway", "Roadside Mower", "180000", "", "", "", "", "", "", "", "", "100000", "", "80000", ""].join(","),
  "",
].join("\r\n");

const HEADER_ALIASES: Record<string, string[]> = {
  fiscalYear: ["fiscal year", "fy", "year"], department: ["department", "dept", "division"],
  title: ["project", "project title", "title", "purpose", "project name"], amount: ["amount", "total", "cost", "approved amount", "appropriation"],
  fundingSource: ["funding source", "source", "funding"], description: ["description", "details", "notes"], status: ["status", "project status"],
};

export function parseHistoryFile(buffer: Buffer, fileName: string): { rows: HistoryRow[]; errors: { row: number; reason: string }[] } {
  let records: Record<string, unknown>[];
  if (fileName.toLowerCase().endsWith(".csv")) {
    records = Papa.parse<Record<string, unknown>>(buffer.toString("utf8").replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase() }).data;
  } else {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new CapitalError("That workbook has no sheets.");
    records = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true }).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v])));
  }
  if (!records.length) throw new CapitalError("The file has no rows.");
  const headers = Object.keys(records[0]);
  const find = (key: string) => headers.find(h => HEADER_ALIASES[key].includes(h));
  const missing = ["fiscalYear", "department", "title"].filter(k => !find(k));
  if (missing.length || (!find("amount") && !FUNDING_SOURCES.some(f => headers.includes(f.label.toLowerCase())))) {
    throw new CapitalError(`Missing column(s): ${[...missing.map(m => ({ fiscalYear: "Fiscal Year", department: "Department", title: "Project" }[m as "fiscalYear"])), ...(!find("amount") ? ["Amount"] : [])].join(", ")}. Download the template to see the expected layout.`);
  }
  const cols = { fy: find("fiscalYear")!, dept: find("department")!, title: find("title")!, amount: find("amount"), src: find("fundingSource"), desc: find("description"), status: find("status") };
  const sourceCols = FUNDING_SOURCES.map(f => ({ key: f.key, header: headers.find(h => h === f.label.toLowerCase()) })).filter(c => c.header) as { key: string; header: string }[];

  const rows: HistoryRow[] = []; const errors: { row: number; reason: string }[] = [];
  records.forEach((r, i) => {
    const rowNumber = i + 2;
    const title = String(r[cols.title] ?? "").trim(); const department = String(r[cols.dept] ?? "").trim();
    if (!title && !department && !String(r[cols.fy] ?? "").trim()) return; // blank row
    const fy = parseFiscalYear(r[cols.fy]);
    if (!fy) return void errors.push({ row: rowNumber, reason: `Fiscal year "${r[cols.fy]}" isn't recognized (use e.g. FY2025 or 2025)` });
    if (!title) return void errors.push({ row: rowNumber, reason: "Missing project name" });
    if (!department) return void errors.push({ row: rowNumber, reason: "Missing department" });
    const funding: Record<string, number> = {};
    for (const c of sourceCols) { const n = parseMoney(r[c.header]); if (n && n > 0) funding[c.key] = n; }
    const split = Object.values(funding).reduce((a, b) => a + b, 0);
    let amount = cols.amount ? parseMoney(r[cols.amount]) : null;
    if ((amount === null || amount === 0) && split > 0) amount = split;
    if (amount === null || amount <= 0) return void errors.push({ row: rowNumber, reason: "Amount is missing or not a positive number" });
    if (split > 0 && Math.abs(split - amount) > 0.01) return void errors.push({ row: rowNumber, reason: `Funding columns add up to $${split.toLocaleString()} but the amount is $${amount.toLocaleString()}` });
    let fundingNote: string | null = null;
    if (split === 0 && cols.src) {
      const text = String(r[cols.src] ?? "").trim();
      if (text) { const k = matchFundingSource(text); if (k) funding[k] = amount; else fundingNote = text; }
    }
    rows.push({ rowNumber, fiscalYear: fy, department, title: title.slice(0, 140), amount, funding, fundingNote,
      description: cols.desc ? String(r[cols.desc] ?? "").trim().slice(0, 4000) || null : null, status: cols.status ? String(r[cols.status] ?? "").trim() || null : null });
  });
  return { rows, errors };
}

/** Capital data uploaded earlier through Admin → Upload becomes importable history */
export async function legacyRows(townId: string, belowYear: string): Promise<HistoryRow[]> {
  const bs = await prisma.budgetRow.findMany({ where: { townId, dataCategory: "capital", fiscalYear: { lt: belowYear } }, select: { fiscalYear: true, department: true, purpose: true, amount: true, fundingSource: true, id: true }, orderBy: [{ fiscalYear: "asc" }, { amount: "desc" }] });
  return bs.filter(b => (b.purpose ?? "").trim() && b.amount > 0).map((b, i) => {
    const k = b.fundingSource ? matchFundingSource(b.fundingSource) : null;
    return { rowNumber: i + 1, fiscalYear: b.fiscalYear, department: (b.department ?? "").trim() || "Other", title: (b.purpose as string).trim().slice(0, 140), amount: b.amount,
      funding: k ? { [k]: b.amount } : {}, fundingNote: b.fundingSource && !k ? b.fundingSource : null, description: null, status: null };
  });
}

// ── Planning ─────────────────────────────────────────────────────────────────

export async function planHistory(townId: string, rows: HistoryRow[]): Promise<{ items: HistoryItem[]; newDepartments: string[] }> {
  const depts = await prisma.capitalDepartment.findMany({ where: { townId }, select: { id: true, name: true } });
  const funded = await prisma.capitalProject.findMany({ where: { townId, requestStatus: "approved" }, select: { id: true, code: true, title: true, departmentId: true, years: { select: { fiscalYear: true, approvedAmount: true } } } });
  const byKey = new Map(funded.map(p => [`${p.departmentId}|${normalizeTitle(p.title)}`, p]));
  const seen = new Set<string>(); const newDepts = new Set<string>(); const items: HistoryItem[] = [];

  for (const row of rows) {
    const d = matchDepartment(row.department, depts);
    if (!d) newDepts.add(row.department.trim());
    const dKey = d ? d.id : `new:${row.department.trim().toLowerCase()}`;
    const titleKey = `${dKey}|${normalizeTitle(row.title)}`;
    const dedupe = `${titleKey}|${row.fiscalYear}`;
    if (seen.has(dedupe)) { items.push({ row, action: "skip", reason: "Repeated in this file", departmentId: d?.id ?? null, targetProjectId: null, targetCode: null }); continue; }
    seen.add(dedupe);
    const match = d ? byKey.get(titleKey) : undefined;
    if (match && match.years.some(y => y.fiscalYear === row.fiscalYear && y.approvedAmount !== null)) {
      items.push({ row, action: "skip", reason: `Already recorded as ${match.code}`, departmentId: d!.id, targetProjectId: match.id, targetCode: match.code });
    } else if (match) {
      items.push({ row, action: "add_year", reason: `Adds FY${row.fiscalYear} funding to ${match.code}`, departmentId: d!.id, targetProjectId: match.id, targetCode: match.code });
    } else {
      items.push({ row, action: "create", reason: null, departmentId: d?.id ?? null, targetProjectId: null, targetCode: null });
    }
  }
  return { items, newDepartments: [...newDepts] };
}

export async function previewHistory(townId: string, rows: HistoryRow[], errors: { row: number; reason: string }[]): Promise<HistoryPreview> {
  const settings = await loadCapitalSettings(townId);
  const bad = rows.filter(r => !isValidDecisionYear(r.fiscalYear, settings) || Number(r.fiscalYear) > Number(settings.adoptedFY));
  const ok = rows.filter(r => !bad.includes(r));
  const allErrors = [...errors, ...bad.map(r => ({ row: r.rowNumber, reason: `FY${r.fiscalYear} is after the adopted year (FY${settings.adoptedFY}). Future years are requested through the project screens, not imported.` }))];
  const { items, newDepartments } = await planHistory(townId, ok);
  const live = items.filter(i => i.action !== "skip");
  const yrs = new Map<string, { count: number; amount: number }>();
  for (const i of live) { const y = yrs.get(i.row.fiscalYear) ?? { count: 0, amount: 0 }; y.count++; y.amount += i.row.amount; yrs.set(i.row.fiscalYear, y); }
  const warnings: string[] = [];
  const noSource = live.filter(i => Object.keys(i.row.funding).length === 0).length;
  if (noSource) warnings.push(`${noSource} project${noSource === 1 ? " has" : "s have"} no recognized funding source. They'll be imported without one; you can add it later.`);
  const unrecognized = [...new Set(live.map(i => i.row.fundingNote).filter(Boolean))] as string[];
  if (unrecognized.length) warnings.push(`Unrecognized funding sources (kept as a note): ${unrecognized.slice(0, 6).join(", ")}${unrecognized.length > 6 ? "…" : ""}`);
  return {
    totalRows: rows.length + errors.length, create: live.filter(i => i.action === "create").length, addYear: live.filter(i => i.action === "add_year").length,
    skip: items.length - live.length, amount: live.reduce((s, i) => s + i.row.amount, 0),
    byYear: [...yrs].map(([fiscalYear, v]) => ({ fiscalYear, ...v })).sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear)),
    newDepartments, errors: allErrors.slice(0, 30), warnings,
    sample: items.slice(0, 12).map(i => ({ fiscalYear: i.row.fiscalYear, department: i.row.department, title: i.row.title, amount: i.row.amount, action: i.action, reason: i.reason })),
  };
}

// ── Committing ───────────────────────────────────────────────────────────────

function deptCode(name: string, taken: Set<string>): string {
  const words = name.replace(/[^A-Za-z ]+/g, " ").split(/\s+/).filter(w => w && !STOP.has(w.toLowerCase()));
  let base = (words.length > 1 ? words.map(w => w[0]).join("") : (words[0] ?? "DEP")).toUpperCase().slice(0, 3);
  if (base.length < 2) base = (base + "XX").slice(0, 2);
  let code = base, n = 1;
  while (taken.has(code)) code = (base.slice(0, 2) + String.fromCharCode(64 + (n++ % 26 || 26))).slice(0, 3) + (n > 26 ? String(n) : "");
  taken.add(code);
  return code;
}

export async function commitHistory(townId: string, rows: HistoryRow[], importedBy: string): Promise<{ created: number; addedYears: number; skipped: number; departmentsCreated: number }> {
  const settings = await loadCapitalSettings(townId);
  const valid = rows.filter(r => isValidDecisionYear(r.fiscalYear, settings) && Number(r.fiscalYear) <= Number(settings.adoptedFY));
  const { items } = await planHistory(townId, valid);
  const todo = items.filter(i => i.action !== "skip");
  const result = { created: 0, addedYears: 0, skipped: items.length - todo.length, departmentsCreated: 0 };
  if (!todo.length) return result;

  await prisma.$transaction(async tx => {
    const depts = await tx.capitalDepartment.findMany({ where: { townId }, select: { id: true, name: true, code: true } });
    const taken = new Set(depts.map(d => d.code));
    const deptByNew = new Map<string, string>();
    const counters = new Map<string, number>();
    const nextCode = async (deptId: string) => {
      const d = (await tx.capitalDepartment.findUnique({ where: { id: deptId }, select: { code: true } }))!;
      if (!counters.has(d.code)) {
        const ex = await tx.capitalProject.findMany({ where: { townId, code: { startsWith: `CIP-${d.code}-` } }, select: { code: true } });
        counters.set(d.code, ex.reduce((m, c) => Math.max(m, parseInt(c.code.split("-").pop() ?? "0", 10) || 0), 0));
      }
      const n = (counters.get(d.code) ?? 0) + 1; counters.set(d.code, n);
      return `CIP-${d.code}-${String(n).padStart(3, "0")}`;
    };
    const createdInBatch = new Map<string, string>(); // dept|title -> project id (so later years join the same project)

    for (const it of todo) {
      const r = it.row;
      let deptId = it.departmentId;
      if (!deptId) {
        const key = r.department.trim().toLowerCase();
        deptId = deptByNew.get(key) ?? null;
        if (!deptId) {
          const d = await tx.capitalDepartment.create({ data: { townId, name: r.department.trim().slice(0, 80), code: deptCode(r.department, taken), sortOrder: depts.length + deptByNew.size } });
          deptId = d.id; deptByNew.set(key, d.id); result.departmentsCreated++;
        }
      }
      const key = `${deptId}|${normalizeTitle(r.title)}`;
      let projectId = it.targetProjectId ?? createdInBatch.get(key) ?? null;
      const split = JSON.stringify(r.funding);
      if (!projectId) {
        const p = await tx.capitalProject.create({
          data: { id: randomUUID(), townId, code: await nextCode(deptId), departmentId: deptId, title: r.title, description: r.description, requestStatus: "approved", approvedFY: r.fiscalYear, isPublic: true,
            projectStatus: mapStatus(r.status) ?? "unreported", percentComplete: mapStatus(r.status) === "complete" ? 100 : null, firstRequestedFY: r.fiscalYear, createdByName: `Imported by ${importedBy}`,
            years: { create: [{ fiscalYear: r.fiscalYear, requestedAmount: r.amount, approvedAmount: r.amount, fundingSplit: split }] } },
        });
        projectId = p.id; createdInBatch.set(key, p.id); result.created++;
      } else {
        await tx.capitalProjectYear.upsert({ where: { projectId_fiscalYear: { projectId, fiscalYear: r.fiscalYear } }, update: { approvedAmount: r.amount, fundingSplit: split }, create: { projectId, fiscalYear: r.fiscalYear, requestedAmount: r.amount, approvedAmount: r.amount, fundingSplit: split } });
        const earliest = await tx.capitalProjectYear.findMany({ where: { projectId, approvedAmount: { not: null } }, orderBy: { fiscalYear: "asc" }, select: { fiscalYear: true }, take: 1 });
        await tx.capitalProject.update({ where: { id: projectId }, data: { approvedFY: earliest[0]?.fiscalYear ?? r.fiscalYear } });
        result.addedYears++;
      }
      await tx.capitalStatusUpdate.create({ data: { projectId, status: mapStatus(r.status) ?? "unreported", note: `Funded in the FY${r.fiscalYear} capital budget: $${r.amount.toLocaleString()}. Imported from prior-year records.`, authorName: importedBy, authorRole: "system" } });
      if (r.fundingNote) await tx.capitalComment.create({ data: { projectId, kind: "admin_note", body: `Import note: FY${r.fiscalYear} funding source in the file was "${r.fundingNote}" (not recognized).`, authorName: importedBy, authorRole: "admin" } });
    }
  }, { timeout: 120000, maxWait: 15000 });
  return result;
}
