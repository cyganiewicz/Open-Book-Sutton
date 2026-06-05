/**
 * Portal sort utilities — applies SortOrder preferences from AccountCodeConfig
 * to the hierarchical data structures used by the expenses and revenues pages.
 */

import type { SortOrder } from "./account-codes";

export function applySortOrder<T>(
  items: T[],
  order: SortOrder,
  getLabel: (item: T) => string,
  getTotal: (item: T) => number
): T[] {
  return [...items].sort((a, b) => {
    switch (order) {
      case "alpha_asc":  return getLabel(a).localeCompare(getLabel(b));
      case "alpha_desc": return getLabel(b).localeCompare(getLabel(a));
      case "total_asc":  return getTotal(a) - getTotal(b);
      case "total_desc":
      default:           return getTotal(b) - getTotal(a);
    }
  });
}
