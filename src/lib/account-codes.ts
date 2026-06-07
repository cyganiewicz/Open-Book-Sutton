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

export interface HierarchyLevel {
  /**
   * Which segment index (from AccountCodeConfig.segments) provides
   * the label for this level. null = use the raw field (functionArea, department, etc.)
   */
  segmentIndex: number | null;
  /** Display name shown in the portal for this level */
  name: string;
  /** Sort order for items at this level */
  sort: SortOrder;
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
  /** Apply these rules when processing revenue uploads too */
  applyToRevenues: boolean;

  /** Portal hierarchy and sort configuration */
  portalOrganization?: PortalOrganization;
}

// ── Default / empty values ─────────────────────────────────────────────────

export const DEFAULT_EXPENSE_LEVELS: HierarchyLevel[] = [
  { segmentIndex: null, name: "Function Area", sort: "total_desc" },
  { segmentIndex: null, name: "Department",    sort: "total_desc" },
  { segmentIndex: null, name: "Category",      sort: "total_desc" },
];

export const DEFAULT_REVENUE_LEVELS: HierarchyLevel[] = [
  { segmentIndex: null, name: "Category",    sort: "total_desc" },
  { segmentIndex: null, name: "Subcategory", sort: "total_desc" },
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

// ── Legacy compatibility ───────────────────────────────────────────────────
export type AccountCodeRules = AccountCodeConfig;
export const parseAccountCodeRules = parseAccountCodeConfig;
export const applyAccountCodeRules = applyAccountCodeConfig;
