import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { groupAndSum, detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { formatCurrency, abbreviateCurrency, formatPercent, calculateChange } from "@/lib/format";
import {
  parseAccountCodeConfig,
  DEFAULT_EXPENSE_LEVELS,
  type HierarchyLevel,
  type GroupField,
} from "@/lib/account-codes";
import {
  type HierarchyNode,
  type SummaryTile,
  fallbackSpendingType,
} from "@/lib/expense-types";
import { resolveSpendingType, applyAccountCodeConfig } from "@/lib/account-codes";
import ExpenseHeader from "@/components/portal/ExpenseHeader";
import DynamicExpenseTable from "@/components/portal/DynamicExpenseTable";
import ExportButton from "@/components/portal/ExportButton";

// ── Types for the dynamic hierarchy ─────────────────────────────────────────

// HierarchyNode and OBJECT_SPENDING_MAP are imported from @/lib/expense-types

// ── Build hierarchy recursively ──────────────────────────────────────────────

type BudgetRowLike = {
  id: string;
  functionArea: string | null;
  department: string | null;
  category1: string | null;
  category2: string | null;
  objectCode: string | null;
  lineItem: string | null;
  fiscalYear: string;
  amount: number;
  amountType: string;
};

function getField(row: BudgetRowLike, field: GroupField): string {
  const v = row[field as keyof BudgetRowLike];
  return (v != null && v !== "") ? String(v) : "";
}

function sortNodes(
  nodes: HierarchyNode[],
  sort: HierarchyLevel["sort"],
  currentYear: string
): HierarchyNode[] {
  return [...nodes].sort((a, b) => {
    switch (sort) {
      case "alpha_asc":  return a.key.localeCompare(b.key);
      case "alpha_desc": return b.key.localeCompare(a.key);
      case "total_asc":  return (a.amounts[currentYear] || 0) - (b.amounts[currentYear] || 0);
      case "total_desc":
      default:           return (b.amounts[currentYear] || 0) - (a.amounts[currentYear] || 0);
    }
  });
}

function buildHierarchy(
  rows: BudgetRowLike[],
  levels: HierarchyLevel[],
  levelIndex: number,
  tableYears: string[],
  currentYear: string,
  allYearRows: BudgetRowLike[]
): HierarchyNode[] {
  if (levelIndex >= levels.length || rows.length === 0) return [];

  const level = levels[levelIndex];
  const isLastGroupLevel = levelIndex === levels.length - 1;

  // Group rows by this level's field
  const groups = new Map<string, BudgetRowLike[]>();
  for (const row of rows) {
    const val = getField(row, level.dataField);
    if (!val && level.skipIfEmpty) {
      // Skip this level for this row — treat as if at next level
      continue;
    }
    const key = val || "(Other)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // Rows that skipped this level (empty field + skipIfEmpty)
  const skippedRows = level.skipIfEmpty
    ? rows.filter(r => !getField(r, level.dataField))
    : [];

  // Build nodes
  const nodes: HierarchyNode[] = [];
  for (const [key, groupRows] of groups) {
    // Compute amounts across all years
    const amounts: Record<string, number> = {};
    for (const y of tableYears) {
      const yRows = allYearRows.filter(r => {
        // Match same group key for this year's rows
        const v = getField(r, level.dataField);
        const k = v || "(Other)";
        return k === key && r.fiscalYear === y &&
          (y === currentYear ? r.amountType === "budget" : r.amountType === "budget" || r.amountType === "actual");
      });
      // But we need ancestor context — use groupRows filtered by year instead
      amounts[y] = 0;
    }
    // Better: compute amounts from groupRows (current year subset) plus year lookups
    for (const y of tableYears) {
      // Find matching rows for this year by tracing the same path
      // For simplicity, sum from allYearRows where this field matches
      amounts[y] = 0; // will be summed below
    }

    if (isLastGroupLevel) {
      // Leaf group — show individual rows
      const leafAmounts: Record<string, number> = {};
      for (const y of tableYears) {
        leafAmounts[y] = allYearRows
          .filter(r => getField(r, level.dataField) === key &&
            r.fiscalYear === y &&
            (y === currentYear ? r.amountType === "budget" : r.amountType === "budget" || r.amountType === "actual"))
          .reduce((s, r) => s + r.amount, 0);
      }
      nodes.push({
        key,
        amounts: leafAmounts,
        isLeaf: true,
        children: [],
        rows: groupRows.map(row => ({
          id: row.id,
          label: row.lineItem || row.objectCode || "",
          objectCode: row.objectCode,
          amounts: {} // filled below
        }))
      });
    } else {
      const children = buildHierarchy(groupRows, levels, levelIndex + 1, tableYears, currentYear, allYearRows);
      const nodeAmounts: Record<string, number> = {};
      for (const y of tableYears) {
        nodeAmounts[y] = children.reduce((s, c) => s + (c.amounts[y] || 0), 0);
      }
      nodes.push({ key, amounts: nodeAmounts, isLeaf: false, children, rows: [] });
    }
  }

  // Append skipped rows as direct leaf nodes at this level
  for (const row of skippedRows) {
    // They'll be handled by the parent level as pass-through
  }

  return sortNodes(nodes, level.sort, currentYear);
}

// Better approach: proper recursive hierarchy with correct year amounts
/** Recursively annotate nodes with spending type totals */
export function annotateSpendingTypes(
  nodes: HierarchyNode[],
  tableYears: string[],
  segments?: import("@/lib/account-codes").AccountSegment[],
  spendingTypeSegIdx?: number | null
): HierarchyNode[] {
  // Resolve spending type using the town's configured account code structure
  function getType(objectCode: string | null): string | null {
    if (!objectCode) return null;
    // Build a minimal config for resolveSpendingType
    if (segments && spendingTypeSegIdx !== null && spendingTypeSegIdx !== undefined) {
      const cfg = { segments, spendingTypeSegment: spendingTypeSegIdx, separator: "-" } as import("@/lib/account-codes").AccountCodeConfig;
      const resolved = resolveSpendingType(objectCode, cfg);
      if (resolved) return resolved;
    }
    // No config or no match — use fallback (last segment prefix)
    return fallbackSpendingType(objectCode, "-");
  }

  return nodes.map(node => {
    type LeafRow = { id: string; label: string; objectCode: string | null; amounts: Record<string, number> };
    const collectRows = (n: HierarchyNode): LeafRow[] => {
      if (n.isLeaf) return n.rows || [];
      return n.children.flatMap(c => collectRows(c));
    };

    const allRows = collectRows(node);
    const spendingTypeTotals: Record<string, Record<string, number>> = {};

    for (const row of allRows || []) {
      const type = getType(row.objectCode);
      if (!type) continue;
      if (!spendingTypeTotals[type]) spendingTypeTotals[type] = {};
      for (const y of tableYears) {
        spendingTypeTotals[type][y] = (spendingTypeTotals[type][y] || 0) + (row.amounts[y] || 0);
      }
    }

    return {
      ...node,
      spendingTypeTotals: Object.keys(spendingTypeTotals).length > 0 ? spendingTypeTotals : undefined,
      children: node.isLeaf ? [] : annotateSpendingTypes(node.children, tableYears, segments, spendingTypeSegIdx),
    };
  });
}

export function buildHierarchyV2(
  currentRows: BudgetRowLike[],
  allYearRows: BudgetRowLike[],
  levels: HierarchyLevel[],
  levelIndex: number,
  tableYears: string[],
  currentYear: string,
  ancestorFilter: (r: BudgetRowLike) => boolean
): HierarchyNode[] {
  if (levelIndex >= levels.length || currentRows.length === 0) return [];

  const level = levels[levelIndex];
  const isLastLevel = levelIndex === levels.length - 1;

  // Helper: build leaf rows from a set of rows
  // Match rows across fiscal years by account code + line item description
  // (not by ID, since each fiscal year upload creates new row IDs)
  const makeLeafRows = (rows: BudgetRowLike[]) =>
    rows.map(row => {
      const acct = row.objectCode || "";
      const desc = row.lineItem || "";
      return {
        id: row.id,
        label: row.lineItem || row.objectCode || "",
        objectCode: row.objectCode,
        amounts: Object.fromEntries(
          tableYears.map(y => [
            y,
            allYearRows
              .filter(r =>
                r.objectCode === acct &&
                r.lineItem === desc &&
                r.fiscalYear === y &&
                (y === currentYear
                  ? r.amountType === "budget"
                  : r.amountType === "budget" || r.amountType === "actual"))
              .reduce((s, r) => s + r.amount, 0),
          ])
        ),
      };
    });

  // Helper: sum amounts for a set of rows across all years
  const sumAmounts = (filter: (r: BudgetRowLike) => boolean): Record<string, number> =>
    Object.fromEntries(
      tableYears.map(y => [
        y,
        allYearRows
          .filter(r => filter(r) && r.fiscalYear === y &&
            (y === currentYear ? r.amountType === "budget" : r.amountType === (yearTypes[y] ?? "budget")))
          .reduce((s, r) => s + r.amount, 0),
      ])
    );

  // Partition: rows that have a value at this level vs those that don't
  const withValue = currentRows.filter(r => getField(r, level.dataField) !== "");
  const withoutValue = level.skipIfEmpty
    ? currentRows.filter(r => getField(r, level.dataField) === "")
    : [];

  // Group rows-with-value by this field
  const groups = new Map<string, BudgetRowLike[]>();
  for (const row of withValue) {
    const key = getField(row, level.dataField);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const nodes: HierarchyNode[] = [];

  for (const [key, groupRows] of groups) {
    const nodeFilter = (r: BudgetRowLike) =>
      ancestorFilter(r) && getField(r, level.dataField) === key;
    const amounts = sumAmounts(nodeFilter);

    if (isLastLevel) {
      nodes.push({ key, amounts, isLeaf: true, children: [], rows: makeLeafRows(groupRows) });
    } else {
      const children = buildHierarchyV2(
        groupRows, allYearRows, levels, levelIndex + 1, tableYears, currentYear, nodeFilter
      );
      nodes.push({ key, amounts, isLeaf: false, children, rows: [] });
    }
  }

  // Rows WITHOUT a value at this skippable level:
  // Instead of bubbling them up as siblings, skip THIS level for them
  // and go directly to the next level — but keep them as direct children
  // of the PARENT node (not mixed with this level's groups).
  // We do this by recursing with levelIndex+1 and merging into nodes.
  if (withoutValue.length > 0) {
    if (isLastLevel) {
      // At the deepest level: just show them as leaf rows directly
      // Match by field values, not IDs (IDs differ across fiscal year uploads)
      const amounts = sumAmounts(r =>
        withoutValue.some(w =>
          w.objectCode === r.objectCode && w.lineItem === r.lineItem &&
          w.department === r.department && w.functionArea === r.functionArea
        )
      );
      if (withoutValue.length > 0) {
        nodes.push({ key: "_direct", amounts, isLeaf: true, children: [], rows: makeLeafRows(withoutValue) });
      }
    } else {
      // Skip this level for these rows — recurse to next level
      // but merge the resulting nodes directly here rather than nesting them
      const skipped = buildHierarchyV2(
        withoutValue, allYearRows, levels, levelIndex + 1, tableYears, currentYear, ancestorFilter
      );
      nodes.push(...skipped);
    }
  }

  return sortNodes(nodes, level.sort, currentYear);
}


export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

  const acConfig = parseAccountCodeConfig(town.accountCodeRules || "");
  const expLevels = acConfig?.portalOrganization?.expenseLevels ?? DEFAULT_EXPENSE_LEVELS;

  const tooltipRows = await prisma.tooltip.findMany({ where: { townId: town.id } });
  const categoryTooltips: Record<string, string> = {};
  const lineItemTooltips: Record<string, string> = {};
  for (const t of tooltipRows) {
    if (t.scope === "category") categoryTooltips[t.key] = t.text;
    else if (t.scope === "line-item") lineItemTooltips[t.key] = t.text;
  }

  const allRows = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "expenses" },
  });

  const { currentYear, previousYear: prevYear, allYears } =
    detectCurrentAndPreviousYear(allRows);

  // Re-classify all rows at render time using the current account code config.
  // Changes to the Account Code dictionary are reflected immediately without re-uploading.
  // Stored DB values are used as fallback if the config doesn't produce a match.
  function reclassifyExpense<T extends {
    objectCode: string | null; functionArea: string | null;
    department: string | null; category1: string | null; category2: string | null;
  }>(row: T): T {
    if (!acConfig) return row;
    const derived = applyAccountCodeConfig(row.objectCode, row.department, acConfig);
    return {
      ...row,
      functionArea: derived.functionArea || row.functionArea,
      department: derived.department || row.department,
      category1: derived.category1 || row.category1,
      category2: derived.category2 || row.category2,
    };
  }

  const allRowsClassified = allRows.map(reclassifyExpense);

  const current = allRowsClassified.filter(
    (r) => r.fiscalYear === currentYear && r.amountType === "budget"
  );
  const prev = prevYear
    ? allRowsClassified.filter(r => r.fiscalYear === prevYear && (r.amountType === "budget" || r.amountType === "actual"))
    : [];

  const currentTotal = current.reduce((s, r) => s + r.amount, 0);
  const prevTotal = prev.reduce((s, r) => s + r.amount, 0);

  // ── Tiles for header ───────────────────────────────────────────────────
  const byFunction = groupAndSum(current, "functionArea");
  const topFn = Object.entries(byFunction).sort((a, b) => b[1] - a[1])[0];
  const tiles: SummaryTile[] = [
    { label: "Total Budget", value: abbreviateCurrency(currentTotal) },
    ...(topFn ? [{ label: "Largest Function", value: topFn[0], sub: abbreviateCurrency(topFn[1]) }] : []),
  ];

  const years = allYears.length > 0 ? allYears : [currentYear];

  // ── Build dynamic hierarchy from portal organization levels ────────────
  const tableYears = allYears.length > 0 ? allYears : [currentYear];

  // For each year, determine which amount type is shown:
  // currentYear → budget, prior years → actual if exists, else budget
  const yearTypes: Record<string, "budget" | "actual"> = {};
  for (const y of tableYears) {
    if (y === currentYear) {
      yearTypes[y] = "budget";
    } else {
      const hasActual = allRowsClassified.some(r => r.fiscalYear === y && r.amountType === "actual");
      yearTypes[y] = hasActual ? "actual" : "budget";
    }
  }

  // All available year+type combinations for the filter UI
  const yearTypeOptions: { year: string; type: "budget" | "actual"; label: string }[] = [];
  for (const y of tableYears) {
    const hasBudget = allRowsClassified.some(r => r.fiscalYear === y && r.amountType === "budget");
    const hasActual = allRowsClassified.some(r => r.fiscalYear === y && r.amountType === "actual");
    if (hasBudget) yearTypeOptions.push({ year: y, type: "budget", label: `FY${y} Budget` });
    if (hasActual) yearTypeOptions.push({ year: y, type: "actual", label: `FY${y} Actual` });
  }

  // Use ALL configured levels for grouping; line items always appear as leaves
  // under the deepest level that has a value for that row
  const allRowsTyped = allRowsClassified as BudgetRowLike[];
  const currentTyped = current as BudgetRowLike[];

  const hierarchyRaw = buildHierarchyV2(
    currentTyped,
    allRowsTyped,
    expLevels,
    0,
    tableYears,
    currentYear,
    () => true
  );
  const hierarchy = annotateSpendingTypes(
    hierarchyRaw, tableYears,
    acConfig?.segments ?? [],
    acConfig?.spendingTypeSegment ?? null
  );

  // Export
  const exportData = current.map(r => {
    const row: Record<string, string> = {
      "Function Area": r.functionArea || "",
      Department: r.department || "",
      Category: r.category1 || "",
      Subcategory: r.category2 || "",
      "Line Item": r.lineItem || "",
      Account: r.objectCode || "",
    };
    for (const y of tableYears) row[`FY${y}`] = formatCurrency(r.amount);
    return row;
  });

  const levelNames = expLevels.map(l => l.name);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-gray-500 mt-1 text-sm">
            FY{currentYear} adopted budget · {current.length.toLocaleString()} line items
          </p>
        </div>
        <ExportButton data={exportData} filename={`${town.slug}-expenses-fy${currentYear}`} />
      </div>

      <ExpenseHeader
        tiles={tiles}
        hierarchy={hierarchy}
        years={years}
        currentYear={currentYear}
        townColor={town.primaryColor}
        totalBudget={currentTotal}
        prevTotal={prevTotal}
        spendingTypeSegmentIndex={acConfig?.spendingTypeSegment ?? null}
        accountSegments={acConfig?.segments ?? []}
      />

      <DynamicExpenseTable
        hierarchy={hierarchy}
        levelNames={levelNames}
        years={tableYears}
        currentYear={currentYear}
        yearTypes={yearTypes}
        yearTypeOptions={yearTypeOptions}
        townColor={town.primaryColor}
        lineItemTooltips={lineItemTooltips}
      />
    </div>
  );
}
