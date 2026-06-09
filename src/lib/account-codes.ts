/**
 * Account Code Dictionary
 *
 * Stored as JSON in Town.accountCodeRules.
 *
 * Key concepts:
 *  - Account codes are split into named Segments by a separator
 *  - Within each segment, individual code values have a Label (specific) and
 *    optionally a Group (rolls multiple codes into one bucket)
 *  - The admin picks which segments drive category1/category2 on the portal
 *  - Each hierarchy level has a configurable sort order
 *  - Code groups allow lumping e.g. dept codes 300,301,302 → "Public Works"
 */

// ── Sort types ─────────────────────────────────────────────────────────────

export type SortOrder =
  | "alpha_asc"    // A → Z
  | "alpha_desc"   // Z → A
  | "total_desc"   // Largest first (default)
  | "total_asc";   // Smallest first

export const SORT_LABELS: Record<SortOrder, string> = {
  alpha_asc:   "A → Z",
  alpha_desc:  "Z → A",
  total_desc:  "Largest first",
  total_asc:   "Smallest first",
};

// ── Core data types ────────────────────────────────────────────────────────

export interface CodeEntry {
  /** Raw code value as it appears in the account string */
  code: string;
  /** Human-readable label for this specific code */
  label: string;
  /**
   * Optional group name. Multiple codes sharing a group are merged into
   * a single bucket on the portal under the group name.
   * e.g. codes "300","301","302" → group "Public Works"
   */
  group?: string;
}

export interface AccountSegment {
  /** 0-based position after splitting by separator */
  index: number;
  /** Admin-assigned name, e.g. "Fund", "Department", "Object Code" */
  name: string;
  /**
   * Number of leading characters to use as the lookup key.
   * 0 = use the full segment value.
   * e.g. prefixLength=2 turns "51110" → key "51"
   */
  prefixLength: number;
  /** All known code definitions for this segment */
  codes: CodeEntry[];
}

// ── Portal organization settings ──────────────────────────────────────────

/**
 * The BudgetRow fields that can be used as grouping levels.
 * These map directly to database column names.
 */
export type GroupField =
  | "functionArea"
  | "department"
  | "category1"
  | "category2"
  | "objectCode"
  | "fundCode"
  | "fundName";

export const GROUP_FIELD_LABELS: Record<GroupField, string> = {
  functionArea: "Function Area",
  department:   "Department",
  category1:    "Category / Spending Type",
  category2:    "Subcategory / Location",
  objectCode:   "Object Code",
  fundCode:     "Fund Code",
  fundName:     "Fund Name",
};

export interface HierarchyLevel {
  /**
   * Which BudgetRow field to group by at this level.
   * Rows with the same value for this field are grouped together.
   */
  dataField: GroupField;
  /** Display name shown in the portal for this level */
  name: string;
  /** Sort order for items at this level */
  sort: SortOrder;
  /**
   * If true, this level is skipped for rows where dataField is null/empty.
   * Those rows fall through to the next level.
   */
  skipIfEmpty?: boolean;
}

export interface PortalOrganization {
  /**
   * Ordered levels for the expenses hierarchy.
   * Typically 2–4 levels: Function → Department → Category → Line Item
   */
  expenseLevels: HierarchyLevel[];
  /**
   * Ordered levels for the revenues hierarchy.
   */
  revenueLevels: HierarchyLevel[];
}

// ── Top-level config ───────────────────────────────────────────────────────

/**
 * Separate configuration for revenue account codes.
 * Revenue accounts often have a completely different structure from expenses,
 * so they get their own segment dictionary.
 */
/**
 * Revenue account code configuration.
 * One segment handles both category and subcategory automatically:
 *   Group  → category1  (roll-up bucket, e.g. "Taxes and Excise")
 *   Label  → category2  (specific line, e.g. "Real Estate Taxes")
 * If Group is blank: category1 = Label, category2 = null.
 */
export interface RevenueCodeConfig {
  separator: string;
  segments: AccountSegment[];
  /** Which segment index holds the revenue type code */
  revenueTypeSegment: number | null;
}

export interface AccountCodeConfig {
  separator: string;
  segments: AccountSegment[];

  /** Which segment drives Function Area (functionArea field) */
  functionAreaSegment: number | null;
  /** Which segment drives Department (department field) */
  departmentSegment: number | null;
  /** Which segment drives Spending Type (category1) */
  spendingTypeSegment: number | null;
  /** Which segment drives Subcategory (category2) */
  subcategorySegment: number | null;
  /** Restrict subcategory derivation to departments matching these strings */
  subcategoryDepartmentFilter: string[];
  /** @deprecated Use revenueConfig instead */
  applyToRevenues: boolean;

  /** Separate revenue account code configuration */
  revenueConfig?: RevenueCodeConfig;

  /** Portal hierarchy and sort configuration */
  portalOrganization?: PortalOrganization;
}

// ── Default / empty values ─────────────────────────────────────────────────

export const DEFAULT_EXPENSE_LEVELS: HierarchyLevel[] = [
  { dataField: "functionArea", name: "Function Area", sort: "total_desc" },
  { dataField: "department",   name: "Department",    sort: "total_desc" },
  { dataField: "category1",    name: "Category",      sort: "total_desc", skipIfEmpty: true },
];

export const DEFAULT_REVENUE_LEVELS: HierarchyLevel[] = [
  { dataField: "category1", name: "Category",    sort: "total_desc" },
  { dataField: "category2", name: "Subcategory", sort: "total_desc", skipIfEmpty: true },
];

export function emptyConfig(): AccountCodeConfig {
  return {
    separator: "-",
    segments: [],
    functionAreaSegment: null,
    departmentSegment: null,
    spendingTypeSegment: null,
    subcategorySegment: null,
    subcategoryDepartmentFilter: [],
    applyToRevenues: false,
    revenueConfig: {
      separator: "-",
      segments: [],
      revenueTypeSegment: null,
    },
    portalOrganization: {
      expenseLevels: DEFAULT_EXPENSE_LEVELS,
      revenueLevels: DEFAULT_REVENUE_LEVELS,
    },
  };
}

// ── Parsing ────────────────────────────────────────────────────────────────

export function parseAccountCodeConfig(json: string): AccountCodeConfig | null {
  if (!json || json.trim() === "") return null;
  try {
    const cfg = JSON.parse(json) as AccountCodeConfig;
    // Back-fill portal organization if missing (older saved configs)
    if (!cfg.portalOrganization) {
      cfg.portalOrganization = {
        expenseLevels: DEFAULT_EXPENSE_LEVELS,
        revenueLevels: DEFAULT_REVENUE_LEVELS,
      };
    }
    return cfg;
  } catch {
    return null;
  }
}

// ── Code lookup ────────────────────────────────────────────────────────────

/**
 * Look up a raw segment value in a segment's code list.
 * Returns the matching CodeEntry, or null if not found.
 */
export function lookupCode(segment: AccountSegment, rawValue: string): CodeEntry | null {
  const key = segment.prefixLength > 0
    ? rawValue.slice(0, segment.prefixLength)
    : rawValue;
  return segment.codes.find((c) => c.code === key) ?? null;
}

/**
 * Resolve a segment value to its display name.
 * Returns group if set, otherwise label, otherwise null.
 */
export function resolveSegmentValue(
  segment: AccountSegment,
  rawValue: string
): string | null {
  const entry = lookupCode(segment, rawValue);
  if (!entry) return null;
  return entry.group || entry.label;
}

/**
 * Split an account code string into segment parts.
 */
export function parseAccountCode(accountCode: string, config: AccountCodeConfig): string[] {
  return config.separator ? accountCode.split(config.separator) : [accountCode];
}

// ── Auto-categorization ────────────────────────────────────────────────────

/**
 * Derive functionArea, department, category1, and category2 from an account
 * code using the config. Pass in already-known department to restrict
 * subcategory derivation by department filter.
 */
export function applyAccountCodeConfig(
  accountCode: string | null,
  existingDepartment: string | null,
  config: AccountCodeConfig
): {
  functionArea: string | null;
  department: string | null;
  category1: string | null;
  category2: string | null;
} {
  if (!accountCode) {
    return { functionArea: null, department: null, category1: null, category2: null };
  }

  const parts = parseAccountCode(accountCode, config);

  const resolve = (segIdx: number | null): string | null => {
    if (segIdx === null) return null;
    const seg = config.segments.find((s) => s.index === segIdx);
    if (!seg) return null;
    const raw = parts[seg.index];
    if (raw === undefined) return null;
    return resolveSegmentValue(seg, raw);
  };

  const functionArea = resolve(config.functionAreaSegment ?? null);
  const department = resolve(config.departmentSegment ?? null);
  const category1 = resolve(config.spendingTypeSegment);

  // Use derived department if available, otherwise fall back to existing
  const deptForFilter = department || existingDepartment;
  let category2: string | null = null;
  if (config.subcategorySegment !== null) {
    const filters = config.subcategoryDepartmentFilter ?? [];
    const deptOk =
      filters.length === 0 ||
      (deptForFilter != null &&
        filters.some((f) => deptForFilter.toLowerCase().includes(f.toLowerCase())));
    if (deptOk) category2 = resolve(config.subcategorySegment);
  }

  return { functionArea, department, category1, category2 };
}

/**
 * Returns which fields are automatically covered by the account code config.
 * Used by the upload UI to skip/relax requirements.
 */
export function getCoveredFields(config: AccountCodeConfig): Set<string> {
  const covered = new Set<string>();
  if (config.functionAreaSegment !== null) covered.add("functionArea");
  if (config.departmentSegment !== null) covered.add("department");
  if (config.spendingTypeSegment !== null) covered.add("category1");
  if (config.subcategorySegment !== null) covered.add("category2");
  return covered;
}

// ── Sort utility ───────────────────────────────────────────────────────────

/**
 * Sort an array of [name, total] pairs according to a SortOrder.
 */
export function sortEntries(
  entries: [string, number][],
  order: SortOrder
): [string, number][] {
  return [...entries].sort((a, b) => {
    switch (order) {
      case "alpha_asc":  return a[0].localeCompare(b[0]);
      case "alpha_desc": return b[0].localeCompare(a[0]);
      case "total_asc":  return a[1] - b[1];
      case "total_desc":
      default:           return b[1] - a[1];
    }
  });
}

// ── Structure detection ────────────────────────────────────────────────────

export function detectAccountStructure(sampleCodes: string[]): {
  separator: string;
  segmentCount: number;
  samples: string[][];
} {
  const candidates = ["-", ".", "_", " "];
  let bestSep = "-";
  let bestCount = 0;
  for (const sep of candidates) {
    const counts = sampleCodes.map((c) => c.split(sep).length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg > bestCount) { bestCount = avg; bestSep = sep; }
  }
  return {
    separator: bestSep,
    segmentCount: Math.round(bestCount),
    samples: sampleCodes.slice(0, 5).map((c) => c.split(bestSep)),
  };
}

// ── Spending type resolution ──────────────────────────────────────────────

/**
 * Resolve the spending type label for a budget row's account code.
 *
 * The objectCode stored in the database is the FULL account string
 * (e.g. "0001-300-300-2210-00-4-00-51110"), not just the last segment.
 * We split it by the configured separator and read the correct segment.
 *
 * Priority:
 *   1. Config spendingTypeSegment → segment codes/groups defined by admin
 *   2. Returns null if not configured (caller decides what to show)
 *
 * @param accountCode  The full account string stored in objectCode field
 * @param config       The town's AccountCodeConfig (may be null if not set)
 * @returns            The spending type label, or null if unresolvable
 */
export function resolveSpendingType(
  accountCode: string | null,
  config: AccountCodeConfig | null
): string | null {
  if (!accountCode || !config) return null;
  if (config.spendingTypeSegment === null || config.spendingTypeSegment === undefined) return null;

  const seg = config.segments.find(s => s.index === config.spendingTypeSegment);
  if (!seg) return null;

  // Split the full account string by the configured separator
  const parts = config.separator ? accountCode.split(config.separator) : [accountCode];
  const raw = parts[seg.index];
  if (!raw) return null;

  // Apply prefix length to get the lookup key
  const key = seg.prefixLength > 0 ? raw.slice(0, seg.prefixLength) : raw;

  // Find matching code entry
  const entry = seg.codes.find(c => c.code === key);
  return entry ? (entry.group || entry.label) : null;
}

/**
 * Resolve category1 and category2 from a revenue account code
 * using the town's RevenueCodeConfig.
 *
 * e.g. "0001-100-146-0000-00-0-00-41200" with categorySegment=7, prefixLength=3
 *   → parts[7] = "41200" → key = "412" → group = "Taxes and Excise"
 */
export function resolveRevenueCategory(
  accountCode: string | null,
  config: RevenueCodeConfig | null | undefined
): { category1: string | null; category2: string | null } {
  if (!accountCode || !config || config.revenueTypeSegment === null) {
    return { category1: null, category2: null };
  }
  const parts = config.separator ? accountCode.split(config.separator) : [accountCode];
  const seg = config.segments.find(s => s.index === config.revenueTypeSegment);
  if (!seg) return { category1: null, category2: null };
  const raw = parts[seg.index];
  if (!raw) return { category1: null, category2: null };
  const key = seg.prefixLength > 0 ? raw.slice(0, seg.prefixLength) : raw;
  const entry = seg.codes.find(c => c.code === key);
  if (!entry) return { category1: null, category2: null };
  // Group → category1 (roll-up), Label → category2 (specific)
  // If no group set, label becomes category1 with no subcategory
  return entry.group
    ? { category1: entry.group, category2: entry.label }
    : { category1: entry.label, category2: null };
}

// ── Legacy compatibility ───────────────────────────────────────────────────
export type AccountCodeRules = AccountCodeConfig;
export const parseAccountCodeRules = parseAccountCodeConfig;
export const applyAccountCodeRules = applyAccountCodeConfig;
