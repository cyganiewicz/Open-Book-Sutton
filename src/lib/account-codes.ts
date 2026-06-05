/**
 * Account Code Dictionary
 *
 * A flexible system for any municipality to define their account number structure.
 * Stored as JSON in Town.accountCodeRules.
 *
 * Concepts:
 *  - The account code is split into named "segments" by a separator character
 *  - Each segment has a name (e.g. "Fund", "Department", "Object Code")
 *  - Within a segment, individual code values map to human labels
 *  - Code values can also be assigned to a "group" (e.g. "51110" is in group "Salaries")
 *  - The admin chooses which segment drives category1 (spending type) and category2 (subcategory)
 *  - Optionally, category2 can be scoped to certain department name patterns
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface CodeEntry {
  /** The raw code value in the account string */
  code: string;
  /** Human-readable label for this code */
  label: string;
  /** Optional group this code belongs to (e.g. "Salaries & Wages") */
  group?: string;
}

export interface AccountSegment {
  /** 0-based index after splitting by separator */
  index: number;
  /** Admin-assigned name for this segment, e.g. "Object Code", "Program" */
  name: string;
  /**
   * How many leading characters to use as the lookup key.
   * 0 = use the entire segment value.
   * e.g. prefixLength=2 turns "51110" into key "51"
   */
  prefixLength: number;
  /** Known code entries for this segment */
  codes: CodeEntry[];
}

export interface AccountCodeConfig {
  /** Character separating segments. Common: "-", ".", "_" */
  separator: string;
  /** Named segments in order */
  segments: AccountSegment[];
  /**
   * Which segment index drives spending type (stored as category1).
   * null = don't auto-derive category1.
   */
  spendingTypeSegment: number | null;
  /**
   * Which segment index drives subcategory (stored as category2).
   * null = don't auto-derive category2.
   */
  subcategorySegment: number | null;
  /**
   * If set, only apply subcategorySegment when the department name
   * contains one of these strings (case-insensitive).
   * Empty array = apply to all departments.
   */
  subcategoryDepartmentFilter: string[];
  /**
   * Whether these rules also apply to revenue account codes.
   */
  applyToRevenues: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function emptyConfig(): AccountCodeConfig {
  return {
    separator: "-",
    segments: [],
    spendingTypeSegment: null,
    subcategorySegment: null,
    subcategoryDepartmentFilter: [],
    applyToRevenues: false,
  };
}

export function parseAccountCodeConfig(json: string): AccountCodeConfig | null {
  if (!json || json.trim() === "") return null;
  try {
    return JSON.parse(json) as AccountCodeConfig;
  } catch {
    return null;
  }
}

/**
 * Look up a code value in a segment's code list.
 * Respects prefixLength — if prefixLength=2, "51110" matches entry with code "51".
 * Returns the matching CodeEntry or null.
 */
export function lookupCode(segment: AccountSegment, rawValue: string): CodeEntry | null {
  const key = segment.prefixLength > 0
    ? rawValue.slice(0, segment.prefixLength)
    : rawValue;
  return segment.codes.find((c) => c.code === key) ?? null;
}

/**
 * Parse an account code string into its segment values.
 */
export function parseAccountCode(
  accountCode: string,
  config: AccountCodeConfig
): string[] {
  return config.separator ? accountCode.split(config.separator) : [accountCode];
}

/**
 * Apply config to a single account code, returning category1 and category2.
 * Uses "group" if available, otherwise falls back to "label".
 */
export function applyAccountCodeConfig(
  accountCode: string | null,
  department: string | null,
  config: AccountCodeConfig
): { category1: string | null; category2: string | null } {
  if (!accountCode) return { category1: null, category2: null };

  const parts = parseAccountCode(accountCode, config);

  const resolve = (segmentIndex: number | null): string | null => {
    if (segmentIndex === null) return null;
    const segment = config.segments.find((s) => s.index === segmentIndex);
    if (!segment) return null;
    const raw = parts[segment.index];
    if (!raw) return null;
    const entry = lookupCode(segment, raw);
    return entry ? (entry.group || entry.label) : null;
  };

  const category1 = resolve(config.spendingTypeSegment);

  let category2: string | null = null;
  if (config.subcategorySegment !== null) {
    const filters = config.subcategoryDepartmentFilter ?? [];
    const deptOk =
      filters.length === 0 ||
      (department != null &&
        filters.some((f) => department.toLowerCase().includes(f.toLowerCase())));
    if (deptOk) {
      category2 = resolve(config.subcategorySegment);
    }
  }

  return { category1, category2 };
}

/**
 * Detect separator and segment count from sample account codes.
 */
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
    if (avg > bestCount) {
      bestCount = avg;
      bestSep = sep;
    }
  }

  return {
    separator: bestSep,
    segmentCount: Math.round(bestCount),
    samples: sampleCodes.slice(0, 5).map((c) => c.split(bestSep)),
  };
}

// Legacy compatibility — older code used AccountCodeRules
export type AccountCodeRules = AccountCodeConfig;
export const parseAccountCodeRules = parseAccountCodeConfig;
export function applyAccountCodeRules(
  accountCode: string | null,
  department: string | null,
  config: AccountCodeConfig
) {
  return applyAccountCodeConfig(accountCode, department, config);
}
