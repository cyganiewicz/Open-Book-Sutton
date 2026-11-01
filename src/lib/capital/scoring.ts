// Readiness checklist, composite priority score, and portfolio analysis.
// All pure functions: no database, easy to test and to explain to a Select Board.

import { CRITERIA, planYears, type CapitalSettings } from "./constants";

// ── Readiness ────────────────────────────────────────────────────────────────

export interface ReadinessInput {
  description: string | null; priority: number | null; costBasis: string | null; estimateType: string | null;
  usefulLifeYears: number | null; operatingImpact: number | null;
  whyImportant: string | null; alternatives: string | null; whoServed: string | null;
  consequences: string | null; benefits: string | null; maintenanceNeeds: string | null;
  years: { requestedAmount: number; approvedAmount: number | null }[];
  hasPhoto: boolean; hasQuote: boolean;
}
export interface ReadinessItem { key: string; label: string; points: number; done: boolean }

const filled = (s: string | null | undefined, min = 10) => (s ?? "").trim().length >= min;

export function readiness(p: ReadinessInput): { score: number; items: ReadinessItem[] } {
  const answered = [p.whyImportant, p.alternatives, p.whoServed, p.consequences, p.benefits, p.maintenanceNeeds].filter(x => filled(x)).length;
  const items: ReadinessItem[] = [
    { key: "description", label: "Description and purpose written", points: 15, done: filled(p.description, 40) },
    { key: "priority", label: "Priority category (1–5) assigned", points: 10, done: p.priority !== null },
    { key: "costs", label: "Costs entered for at least one year", points: 10, done: p.years.some(y => y.requestedAmount > 0 || (y.approvedAmount ?? 0) > 0) },
    { key: "costBasis", label: "Explains how the costs were developed", points: 10, done: filled(p.costBasis, 15) },
    { key: "estimate", label: "Estimate type identified (quote, engineer's estimate…)", points: 5, done: !!p.estimateType },
    { key: "quote", label: "Recent quote or estimate attached", points: 15, done: p.hasQuote },
    { key: "life", label: "Useful life stated", points: 5, done: p.usefulLifeYears !== null && p.usefulLifeYears > 0 },
    { key: "questionnaire", label: "Project questionnaire answered (at least 5 of 6 questions)", points: 15, done: answered >= 5 },
    { key: "operating", label: "Operating budget impact estimated (enter $0 if none)", points: 5, done: p.operatingImpact !== null },
    { key: "photo", label: "Photo attached", points: 10, done: p.hasPhoto },
  ];
  return { score: items.reduce((s, i) => s + (i.done ? i.points : 0), 0), items };
}

// ── Composite score ──────────────────────────────────────────────────────────

/** Critical = 100 … Enhancement = 20 */
export const priorityPoints = (p: number | null): number | null => (p && p >= 1 && p <= 5 ? 120 - p * 20 : null);
export const effectivePriority = (priority: number | null, override: number | null) => override ?? priority;

export interface ScoreInput {
  priority: number | null;
  scores: Record<string, number>;   // admin criteria, each 0–5
  readiness: number;                // 0–100
  weights: Record<string, number>;
}
export interface ScoreResult {
  score: number | null;
  scoredCriteria: number;
  totalCriteria: number;
  parts: { key: string; label: string; weight: number; points: number | null }[];
}

export function compositeScore(i: ScoreInput): ScoreResult {
  const parts = CRITERIA.map(c => {
    let points: number | null = null;
    if (c.source === "priority") points = priorityPoints(i.priority);
    else if (c.source === "readiness") points = i.readiness;
    else if (typeof i.scores[c.key] === "number") points = Math.max(0, Math.min(5, i.scores[c.key])) * 20;
    return { key: c.key, label: c.label, weight: i.weights[c.key] ?? c.weight, points };
  });
  const used = parts.filter(p => p.points !== null && p.weight > 0);
  const wsum = used.reduce((s, p) => s + p.weight, 0);
  const score = wsum > 0 ? Math.round(used.reduce((s, p) => s + p.weight * (p.points as number), 0) / wsum) : null;
  return { score, scoredCriteria: used.length, totalCriteria: parts.filter(p => p.weight > 0).length, parts };
}

// ── Portfolio analysis ───────────────────────────────────────────────────────

export interface AnalysisProject {
  id: string; code: string; title: string; department: string; requestStatus: string;
  priority: number | null; // effective priority
  operatingImpact: number | null; readiness: number; composite: number | null;
  years: { fiscalYear: string; requestedAmount: number; recommendedAmount: number | null; approvedAmount: number | null }[];
}

const COUNTED = ["draft", "submitted", "under_review", "recommended", "approved"];

/** The number we plan around for a project-year: approved, else recommended, else requested. Closed years only count if funded. */
export function plannedAmount(p: AnalysisProject, fy: string, adoptedFY: string): number {
  if (!COUNTED.includes(p.requestStatus)) return 0;
  const y = p.years.find(r => r.fiscalYear === fy);
  if (!y) return 0;
  if (fy <= adoptedFY) return y.approvedAmount ?? 0;
  return y.approvedAmount ?? y.recommendedAmount ?? y.requestedAmount;
}

export interface Analysis {
  years: {
    fiscalYear: string; requested: number; recommended: number; approved: number; planned: number;
    capacity: number | null; gap: number | null; projectCount: number;
  }[];
  byPriority: { priority: number | null; label: string; count: number; planned: number }[];
  byDepartment: { department: string; byYear: Record<string, number>; total: number }[];
  watch: {
    overCapacity: { fiscalYear: string; planned: number; capacity: number; over: number }[];
    criticalPushedOut: { id: string; code: string; title: string; department: string; firstYear: string | null }[];
    lowReadinessNextYear: { id: string; code: string; title: string; department: string; readiness: number; amount: number }[];
    major: { id: string; code: string; title: string; department: string; fiscalYear: string; amount: number }[];
  };
  operatingImpact: { total: number; counted: number };
}

export function analyze(projects: AnalysisProject[], settings: CapitalSettings, majorThreshold = 1_000_000): Analysis {
  const years = planYears(settings);
  const adopted = settings.adoptedFY;
  const nextYear = years[1];
  const live = projects.filter(p => COUNTED.includes(p.requestStatus));

  const yearRows = years.map(fy => {
    let requested = 0, recommended = 0, approved = 0, planned = 0, count = 0;
    for (const p of live) {
      const y = p.years.find(r => r.fiscalYear === fy);
      if (y) {
        if (fy > adopted) { requested += y.requestedAmount; recommended += y.recommendedAmount ?? 0; }
        approved += y.approvedAmount ?? 0;
      }
      const pa = plannedAmount(p, fy, adopted);
      planned += pa; if (pa > 0) count++;
    }
    const capacity = settings.capacityByYear[fy] ?? null;
    return { fiscalYear: fy, requested, recommended, approved, planned, capacity, gap: capacity === null ? null : capacity - planned, projectCount: count };
  });

  const labels: Record<string, string> = { "1": "Critical", "2": "High", "3": "Asset preservation", "4": "Service improvement", "5": "Enhancement" };
  const byPriority = [1, 2, 3, 4, 5, null].map(pr => {
    const ps = live.filter(p => p.priority === pr);
    const planned = ps.reduce((s, p) => s + years.reduce((a, fy) => a + plannedAmount(p, fy, adopted), 0), 0);
    return { priority: pr, label: pr === null ? "Not yet assigned" : labels[String(pr)], count: ps.length, planned };
  });

  const deptMap = new Map<string, Record<string, number>>();
  for (const p of live) {
    const row = deptMap.get(p.department) ?? {};
    for (const fy of years) row[fy] = (row[fy] ?? 0) + plannedAmount(p, fy, adopted);
    deptMap.set(p.department, row);
  }
  const byDepartment = [...deptMap].map(([department, byYear]) => ({ department, byYear, total: Object.values(byYear).reduce((a, b) => a + b, 0) }))
    .filter(d => d.total > 0).sort((a, b) => b.total - a.total);

  const overCapacity = yearRows.filter(y => y.capacity !== null && y.planned > y.capacity!)
    .map(y => ({ fiscalYear: y.fiscalYear, planned: y.planned, capacity: y.capacity as number, over: y.planned - (y.capacity as number) }));

  const criticalPushedOut = live.filter(p => p.priority !== null && p.priority <= 2 && p.requestStatus !== "approved")
    .map(p => ({ p, first: years.find(fy => fy > adopted && plannedAmount(p, fy, adopted) > 0) ?? null }))
    .filter(x => x.first === null || x.first >= years[Math.min(2, years.length - 1)])
    .map(x => ({ id: x.p.id, code: x.p.code, title: x.p.title, department: x.p.department, firstYear: x.first }));

  const lowReadinessNextYear = live.filter(p => p.readiness < 60 && plannedAmount(p, nextYear, adopted) > 0)
    .map(p => ({ id: p.id, code: p.code, title: p.title, department: p.department, readiness: p.readiness, amount: plannedAmount(p, nextYear, adopted) }))
    .sort((a, b) => b.amount - a.amount);

  const major: Analysis["watch"]["major"] = [];
  for (const p of live) for (const fy of years) {
    const amt = plannedAmount(p, fy, adopted);
    if (amt >= majorThreshold) major.push({ id: p.id, code: p.code, title: p.title, department: p.department, fiscalYear: fy, amount: amt });
  }

  const withImpact = live.filter(p => p.operatingImpact !== null);
  return {
    years: yearRows, byPriority, byDepartment,
    watch: { overCapacity, criticalPushedOut, lowReadinessNextYear, major: major.sort((a, b) => b.amount - a.amount) },
    operatingImpact: { total: withImpact.reduce((s, p) => s + (p.operatingImpact as number), 0), counted: withImpact.length },
  };
}
