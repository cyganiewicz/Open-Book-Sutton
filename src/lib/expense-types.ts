/**
 * Shared types and constants for the expenses hierarchy.
 * This file must have NO server-side imports (no prisma, no fs, etc.)
 * so it can be safely imported by both server and client components.
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

/** Map object code prefix to spending type label (MA MUNIS standard) */
export const OBJECT_SPENDING_MAP: Record<string, string> = {
  "51": "Salaries & Wages",
  "52": "Employee Benefits",
  "53": "Purchased Services",
  "54": "Supplies & Materials",
  "55": "Supplies & Materials",
  "57": "Other Charges & Expenses",
  "58": "Capital Outlay",
  "59": "Debt Service",
};
