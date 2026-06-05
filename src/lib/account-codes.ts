/**
 * Account Code Auto-Categorization
 *
 * Towns define their own account number structure via the admin panel.
 * Rules are stored as JSON on the Town record and applied at upload time.
 *
 * The structure lets any town define:
 *  - How their account code is segmented (separator + segment positions)
 *  - Which segment drives "spending type" (category1)
 *  - Which segment drives "subcategory" (category2), optionally scoped to a department
 *  - The value→label mapping for each segment
 */

export interface AccountSegmentRule {
  /** Which segment index (0-based) to read, after splitting by separator */
  segmentIndex: number;
  /** How many characters from the start of the segment to use as the key (0 = whole segment) */
  prefixLength: number;
  /** value (or prefix) → human label */
  mapping: Record<string, string>;
}

export interface AccountCodeRules {
  /** Character used to split the account code. Common: "-", ".", "" (fixed-width) */
  separator: string;
  /** Rule for deriving spending type (stored as category1) */
  spendingTypeRule?: AccountSegmentRule;
  /** Rule for deriving subcategory (stored as category2) */
  subcategoryRule?: AccountSegmentRule;
  /**
   * Optional: only apply subcategoryRule when the department name contains
   * one of these strings (case-insensitive). Leave empty to apply to all.
   */
  subcategoryDepartmentFilter?: string[];
}

/** Parse the JSON rules string stored on the Town record */
export function parseAccountCodeRules(rulesJson: string): AccountCodeRules | null {
  if (!rulesJson || rulesJson.trim() === "") return null;
  try {
    return JSON.parse(rulesJson) as AccountCodeRules;
  } catch {
    return null;
  }
}

/** Apply rules to a single account code string, returning category1 and category2 */
export function applyAccountCodeRules(
  accountCode: string | null,
  department: string | null,
  rules: AccountCodeRules
): { category1: string | null; category2: string | null } {
  if (!accountCode) return { category1: null, category2: null };

  const parts = rules.separator
    ? accountCode.split(rules.separator)
    : [accountCode];

  const resolveLabel = (rule: AccountSegmentRule): string | null => {
    const segment = parts[rule.segmentIndex];
    if (!segment) return null;
    const key = rule.prefixLength > 0 ? segment.slice(0, rule.prefixLength) : segment;
    return rule.mapping[key] ?? null;
  };

  const category1 = rules.spendingTypeRule ? resolveLabel(rules.spendingTypeRule) : null;

  let category2: string | null = null;
  if (rules.subcategoryRule) {
    const filters = rules.subcategoryDepartmentFilter ?? [];
    const deptOk =
      filters.length === 0 ||
      (department != null &&
        filters.some((f) => department.toLowerCase().includes(f.toLowerCase())));
    if (deptOk) {
      category2 = resolveLabel(rules.subcategoryRule);
    }
  }

  return { category1, category2 };
}

/**
 * Detect the likely separator and segment count from sample account codes.
 * Returns a best-guess structure for the admin UI to pre-populate.
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

  const samples = sampleCodes
    .slice(0, 5)
    .map((c) => c.split(bestSep));

  return { separator: bestSep, segmentCount: Math.round(bestCount), samples };
}
