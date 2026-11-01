// Shared definitions for the Capital Improvement Program (CIP).
// Wording follows the town's CIP manual (definition of a capital project, 1–5 priority scale,
// evaluation criteria A–C, questionnaire) so what departments see matches what they were asked for.

export const FUNDING_SOURCES = [
  { key: "free_cash", label: "Free Cash", help: "Certified surplus from the prior fiscal year" },
  { key: "tax_levy", label: "Tax Levy", help: "Raised in the operating budget" },
  { key: "other_funds", label: "Other Available Funds", help: "Revolving, special revenue or trust funds" },
  { key: "ent_retained", label: "Enterprise Fund Retained Earnings", help: "Sewer/water enterprise reserves" },
  { key: "ent_borrowing", label: "Enterprise Fund Borrowing", help: "Debt repaid from enterprise fees" },
  { key: "cap_stab", label: "Capital Stabilization Fund", help: "Reserve set aside for capital" },
  { key: "gf_borrowing", label: "General Fund Borrowing", help: "Debt repaid from the general fund" },
  { key: "grant", label: "Grant / Outside Funding", help: "Federal, state or private reimbursement" },
] as const;
export type FundingKey = (typeof FUNDING_SOURCES)[number]["key"];
export const fundingLabel = (key: string) => FUNDING_SOURCES.find(f => f.key === key)?.label ?? key;

export const PRIORITIES = [
  { value: 1, label: "Critical / Mandated", short: "Critical",
    description: "Life-safety, a legal mandate, or an imminent failure risk. Cannot reasonably be postponed.",
    example: "Repairing a collapsing bridge; replacing critical infrastructure about to fail." },
  { value: 2, label: "High / Compliance", short: "High",
    description: "Health and safety, or code and regulatory compliance within about a year; replacing worn-out facilities.",
    example: "Bringing a building up to accessibility standards; replacing outdated HVAC." },
  { value: 3, label: "Asset Preservation", short: "Preservation",
    description: "Prevents deterioration and sustains existing assets; extends life 10+ years or stabilizes operating costs.",
    example: "Roof replacement; road resurfacing; replacing aging fleet vehicles." },
  { value: 4, label: "Service Improvement", short: "Service",
    description: "Improves efficiency, service levels or reliability to meet documented new or expanded demand.",
    example: "Library technology upgrades; new software to streamline processes." },
  { value: 5, label: "Enhancement", short: "Enhancement",
    description: "Strategic or quality-of-life improvement that can be postponed if not an immediate need.",
    example: "New recreational trails; landscaping improvements." },
] as const;
export const priorityShort = (p: number | null | undefined) => PRIORITIES.find(x => x.value === p)?.short ?? "Not set";

export const CATEGORIES = ["Vehicles & Equipment", "Technology", "Buildings & Facilities", "Infrastructure & Utilities", "Planning & Studies", "Other"];

// Where a request is in the budget process
export const REQUEST_STATUSES = [
  { key: "draft", label: "Draft", tone: "gray" },
  { key: "submitted", label: "Submitted", tone: "blue" },
  { key: "under_review", label: "Under review", tone: "amber" },
  { key: "recommended", label: "Recommended", tone: "violet" },
  { key: "approved", label: "Funded", tone: "green" },
  { key: "not_funded", label: "Not funded", tone: "red" },
  { key: "withdrawn", label: "Withdrawn", tone: "gray" },
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number]["key"];
export const requestStatusLabel = (k: string) => REQUEST_STATUSES.find(s => s.key === k)?.label ?? k;

// What is happening with a funded project
export const PROJECT_STATUSES = [
  { key: "not_started", label: "Not started" },
  { key: "planning", label: "Planning / design" },
  { key: "procurement", label: "Procurement / bidding" },
  { key: "in_progress", label: "In progress" },
  { key: "complete", label: "Complete" },
  { key: "on_hold", label: "On hold" },
  { key: "cancelled", label: "Cancelled" },
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["key"];
export const projectStatusLabel = (k: string) => PROJECT_STATUSES.find(s => s.key === k)?.label ?? k;

export const ESTIMATE_TYPES = [
  { key: "quote", label: "Vendor quote" },
  { key: "engineer", label: "Engineer / design estimate" },
  { key: "budgetary", label: "Budgetary estimate" },
  { key: "rough", label: "Rough order of magnitude" },
] as const;

export const COST_COMPONENTS = ["Planning / design", "Engineering", "Construction / purchase", "Equipment", "Contingency", "Other"];

// Fields a department head cannot change once any year of the project is funded
export const LOCKED_WHEN_APPROVED = ["title", "description", "location", "category", "departmentId"] as const;

// ── Evaluation (admin) ───────────────────────────────────────────────────────

export interface Criterion {
  key: string;
  label: string;
  help: string;
  source: "priority" | "admin" | "readiness";
  weight: number;
}
export const CRITERIA: Criterion[] = [
  { key: "priority", label: "Priority category (1–5)", source: "priority", weight: 35,
    help: "From the department's priority scale (Critical scores highest). An admin override can be set." },
  { key: "history", label: "A. Project history & funding potential", source: "admin", weight: 15,
    help: "How long it has been in the CIP (persistent need) and potential for grants or new revenue." },
  { key: "modernization", label: "B. Infrastructure maintenance & modernization", source: "admin", weight: 15,
    help: "Maintains existing infrastructure, replaces equipment no longer cost-effective to repair, or modernizes service delivery." },
  { key: "capacity", label: "C. Capacity & growth alignment", source: "admin", weight: 10,
    help: "Increases capacity to meet the Town's growth and evolving needs." },
  { key: "reach", label: "Reach: people who benefit", source: "admin", weight: 10,
    help: "Number of actual or potential users or beneficiaries." },
  { key: "benefits", label: "Quantifiable & non-quantifiable benefits", source: "admin", weight: 5,
    help: "Cost savings, risk reduction, service quality and other benefits." },
  { key: "readiness", label: "Readiness", source: "readiness", weight: 10,
    help: "Automatic: is the scope, cost basis and documentation solid enough to fund? (GFOA: advance only well-defined projects.)" },
];

// ── Settings ─────────────────────────────────────────────────────────────────

export interface CapitalSettings {
  /** The fiscal year whose capital budget has been adopted. Its funded projects are locked. */
  adoptedFY: string;
  submissionsOpen: boolean;
  /** Optional last day departments can edit requests (ISO date) */
  submissionDeadline: string | null;
  /** Funding the Town expects to be able to commit to capital each year */
  capacityByYear: Record<string, number>;
  weights: Record<string, number>;
  planLength: number;
}

export const DEFAULT_CAPITAL_SETTINGS: CapitalSettings = {
  adoptedFY: "2027",
  submissionsOpen: true,
  submissionDeadline: null,
  capacityByYear: {},
  weights: Object.fromEntries(CRITERIA.map(c => [c.key, c.weight])),
  planLength: 6,
};

export function parseCapitalSettings(json: string | null | undefined): CapitalSettings {
  const d = DEFAULT_CAPITAL_SETTINGS;
  if (!json || !json.trim()) return d;
  try {
    const p = JSON.parse(json) as Partial<CapitalSettings>;
    return {
      adoptedFY: typeof p.adoptedFY === "string" && /^\d{4}$/.test(p.adoptedFY) ? p.adoptedFY : d.adoptedFY,
      submissionsOpen: typeof p.submissionsOpen === "boolean" ? p.submissionsOpen : d.submissionsOpen,
      submissionDeadline: typeof p.submissionDeadline === "string" && p.submissionDeadline ? p.submissionDeadline : null,
      capacityByYear: p.capacityByYear && typeof p.capacityByYear === "object" ? p.capacityByYear : {},
      weights: { ...d.weights, ...(p.weights && typeof p.weights === "object" ? p.weights : {}) },
      planLength: Number.isInteger(p.planLength) && p.planLength! >= 3 && p.planLength! <= 10 ? p.planLength! : d.planLength,
    };
  } catch { return d; }
}

/** Fiscal years covered by the plan, starting with the adopted year */
export function planYears(s: CapitalSettings): string[] {
  const start = Number(s.adoptedFY);
  return Array.from({ length: s.planLength }, (_, i) => String(start + i));
}

/** Can departments edit right now? (admin toggle + optional deadline, end of day) */
export function submissionsOpenNow(s: CapitalSettings, now = new Date()): boolean {
  if (!s.submissionsOpen) return false;
  if (!s.submissionDeadline) return true;
  const end = new Date(`${s.submissionDeadline.slice(0, 10)}T23:59:59`);
  return now <= end;
}
