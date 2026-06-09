/**
 * Shared types for the expenses hierarchy.
 * NO server-side imports — safe for both server and client components.
 *
 * For spending type resolution, use resolveSpendingType() from account-codes.ts.
 * That function correctly reads the town's configured segment structure.
 */

export interface HierarchyNode {
  key: string;
  amounts: Record<string, number>;
  children: HierarchyNode[];
  isLeaf: boolean;
  rows?: {
    id: string;
    label: string;
    objectCode: string | null;
    amounts: Record<string, number>;
  }[];
  spendingTypeTotals?: Record<string, Record<string, number>>;
}

export interface SummaryTile {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  negative?: boolean;
}

/**
 * MA MUNIS standard object code prefix → spending type label.
 *
 * This is a FALLBACK only — used when a town has not configured
 * a spendingTypeSegment in their Account Code Dictionary.
 * Always prefer resolveSpendingType() from account-codes.ts.
 */
export const MUNIS_FALLBACK_MAP: Record<string, string> = {
  "51": "Salaries & Wages",
  "52": "Employee Benefits",
  "53": "Purchased Services",
  "54": "Supplies & Materials",
  "55": "Supplies & Materials",
  "57": "Other Charges & Expenses",
  "58": "Capital Outlay",
  "59": "Debt Service",
  "595": "Other Financing Uses",
};

/**
 * Extract the last segment of a full account string.
 * e.g. "0001-300-300-2210-00-4-00-51110" → "51110"
 */
export function extractObjectSuffix(accountCode: string | null, separator = "-"): string {
  if (!accountCode) return "";
  const parts = separator ? accountCode.split(separator) : [accountCode];
  return parts[parts.length - 1] || accountCode;
}

/**
 * Fallback-only spending type lookup using the last segment of the account code
 * against the MUNIS_FALLBACK_MAP. Only use this when no config is available.
 */
export function fallbackSpendingType(accountCode: string | null, separator = "-"): string | null {
  if (!accountCode) return null;
  const suffix = extractObjectSuffix(accountCode, separator);
  const prefix = suffix.slice(0, 3);
  return MUNIS_FALLBACK_MAP[prefix] || null;
}

/**
 * A column key combining fiscal year and amount type.
 * e.g. "2025:budget" or "2025:actual"
 */
export function colKey(year: string, type: "budget" | "actual"): string {
  return `${year}:${type}`;
}

export function parseColKey(key: string): { year: string; type: "budget" | "actual" } {
  const [year, type] = key.split(":");
  return { year, type: (type as "budget" | "actual") || "budget" };
}

// Keep OBJECT_SPENDING_MAP as an alias for backward compatibility
// @deprecated — use resolveSpendingType() from account-codes.ts
export const OBJECT_SPENDING_MAP = MUNIS_FALLBACK_MAP;
