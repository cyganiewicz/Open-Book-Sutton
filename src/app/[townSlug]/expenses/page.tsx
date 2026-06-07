import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { groupAndSum, toChartData, detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { formatCurrency, abbreviateCurrency, formatPercent, calculateChange } from "@/lib/format";
import {
  parseAccountCodeConfig,
  DEFAULT_EXPENSE_LEVELS,
  type HierarchyLevel,
  type GroupField,
} from "@/lib/account-codes";
import SummaryTiles from "@/components/portal/SummaryTiles";
import PieChart from "@/components/portal/PieChart";
import BarChart from "@/components/portal/BarChart";
import DynamicExpenseTable from "@/components/portal/DynamicExpenseTable";
import ExportButton from "@/components/portal/ExportButton";
import type { SummaryTile } from "@/types";

// ── Types for the dynamic hierarchy ─────────────────────────────────────────

export interface HierarchyNode {
  key: string;        // the group value (e.g. "Public Safety")
  amounts: Record<string, number>;
  children: HierarchyNode[];
  isLeaf: boolean;
  rows?: { id: string; label: string; objectCode: string | null; amounts: Record<string, number> }[];
  /** Spending type subtotals for this node (sum by object code prefix) */
  spendingTypeTotals?: Record<string, Record<string, number>>; // type → year → amount
}

/** Map object code prefix to spending type label */
export const OBJECT_SPENDING_MAP: Record<string, string> = {
  "51": "Salaries & Wages", "52": "Employee Benefits",
  "53": "Purchased Services", "54": "Supplies & Materials",
  "55": "Supplies & Materials", "57": "Other Charges & Expenses",
  "58": "Capital Outlay", "59": "Debt Service",
  "61": "Special Ed Tuition", "62": "Special Ed Tuition", "63": "Special Ed Tuition",
};

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
  tableYears: string[]
): HierarchyNode[] {
  return nodes.map(node => {
    // Collect all leaf rows under this node
    type LeafRow = { id: string; label: string; objectCode: string | null; amounts: Record<string, number> };
    const collectRows = (n: HierarchyNode): LeafRow[] => {
      if (n.isLeaf) return n.rows || [];
      return n.children.flatMap(c => collectRows(c));
    };

    const allRows = collectRows(node);
    const spendingTypeTotals: Record<string, Record<string, number>> = {};

    for (const row of allRows || []) {
      const prefix = (row.objectCode || "").slice(0, 2);
      const type = OBJECT_SPENDING_MAP[prefix];
      if (!type) continue;
      if (!spendingTypeTotals[type]) spendingTypeTotals[type] = {};
      for (const y of tableYears) {
        spendingTypeTotals[type][y] = (spendingTypeTotals[type][y] || 0) + (row.amounts[y] || 0);
      }
    }

    return {
      ...node,
      spendingTypeTotals: Object.keys(spendingTypeTotals).length > 0 ? spendingTypeTotals : undefined,
      children: node.isLeaf ? [] : annotateSpendingTypes(node.children, tableYears),
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
  const makeLeafRows = (rows: BudgetRowLike[]) =>
    rows.map(row => ({
      id: row.id,
      label: row.lineItem || row.objectCode || "",
      objectCode: row.objectCode,
      amounts: Object.fromEntries(
        tableYears.map(y => [
          y,
          allYearRows
            .filter(r => r.id === row.id && r.fiscalYear === y &&
              (y === currentYear ? r.amountType === "budget" : r.amountType === "budget" || r.amountType === "actual"))
            .reduce((s, r) => s + r.amount, 0),
        ])
      ),
    }));

  // Helper: sum amounts for a set of rows across all years
  const sumAmounts = (filter: (r: BudgetRowLike) => boolean): Record<string, number> =>
    Object.fromEntries(
      tableYears.map(y => [
        y,
        allYearRows
          .filter(r => filter(r) && r.fiscalYear === y &&
            (y === currentYear ? r.amountType === "budget" : r.amountType === "budget" || r.amountType === "actual"))
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
      const amounts = sumAmounts(r => withoutValue.some(w => w.id === r.id));
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

  const current = allRows.filter(
    (r) => r.fiscalYear === currentYear && r.amountType === "budget"
  );
  const prev = prevYear
    ? allRows.filter(r => r.fiscalYear === prevYear && (r.amountType === "budget" || r.amountType === "actual"))
    : [];

  const currentTotal = current.reduce((s, r) => s + r.amount, 0);
  const prevTotal = prev.reduce((s, r) => s + r.amount, 0);

  // ── KPI tiles ──────────────────────────────────────────────────────────
  const tiles: SummaryTile[] = [
    { label: "Total Budget", value: abbreviateCurrency(currentTotal) },
  ];
  if (prevTotal > 0) {
    const change = calculateChange(prevTotal, currentTotal);
    tiles.push({
      label: "vs Prior Year",
      value: formatCurrency(change.absolute),
      change: formatPercent(change.percent),
      changeType: change.absolute >= 0 ? "positive" : "negative",
    });
  }
  const byFunction = groupAndSum(current, "functionArea");
  const topFn = Object.entries(byFunction).sort((a, b) => b[1] - a[1])[0];
  if (topFn) {
    tiles.push({ label: "Largest Function", value: topFn[0], change: abbreviateCurrency(topFn[1]), changeType: "neutral" });
  }
  // Spending type: use objectCode prefix mapping for town-wide totals
  // This avoids the issue of category1 being used for location in some depts
  const OBJECT_SPENDING_MAP: Record<string, string> = {
    "51": "Salaries & Wages", "52": "Employee Benefits",
    "53": "Purchased Services", "54": "Supplies & Materials",
    "55": "Supplies & Materials", "57": "Other Charges & Expenses",
    "58": "Capital Outlay", "59": "Debt Service",
    "61": "Special Ed Tuition", "62": "Special Ed Tuition", "63": "Special Ed Tuition",
  };
  const bySpendingType: Record<string, number> = {};
  for (const row of current) {
    // Try objectCode first (last segment of account), then fall back to category1
    const obj = row.objectCode || "";
    const prefix = obj.slice(0, 2);
    const type = OBJECT_SPENDING_MAP[prefix] || row.category1 || null;
    if (type) bySpendingType[type] = (bySpendingType[type] || 0) + row.amount;
  }
  const spendingTypeEntries = Object.entries(bySpendingType).sort((a, b) => b[1] - a[1]);
  for (const [type, amount] of spendingTypeEntries.slice(0, 3)) {
    const pct = currentTotal > 0 ? (amount / currentTotal) * 100 : 0;
    tiles.push({ label: type, value: abbreviateCurrency(amount), change: `${pct.toFixed(1)}% of budget`, changeType: "neutral" });
  }

  // ── Charts ─────────────────────────────────────────────────────────────
  const byFunctionChart = toChartData(byFunction);
  const bySpendingTypeChart = spendingTypeEntries.length > 0 ? toChartData(bySpendingType) : null;
  const years = allYears.length > 0 ? allYears : [currentYear];
  const functions: string[] = [...new Set(current.map(r => r.functionArea || "Other"))];
  const trendSeries = functions.slice(0, 8).map(fn => ({
    label: fn,
    data: years.map(y => allRows.filter(r => r.functionArea === fn && r.fiscalYear === y).reduce((s, r) => s + r.amount, 0)),
  }));

  // ── Build dynamic hierarchy from portal organization levels ────────────
  const tableYears = allYears.length > 0 ? allYears : [currentYear];

  // Use ALL configured levels for grouping; line items always appear as leaves
  // under the deepest level that has a value for that row
  const allRowsTyped = allRows as BudgetRowLike[];
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
  const hierarchy = annotateSpendingTypes(hierarchyRaw, tableYears);

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

      <SummaryTiles tiles={tiles} tooltips={categoryTooltips} townColor={town.primaryColor} />

      {/* Charts - pie charts side by side on top, bar chart full width below */}
      <div className={`grid gap-4 ${bySpendingTypeChart ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
        <PieChart data={byFunctionChart} title={`FY${currentYear} by Function Area`} townColor={town.primaryColor} />
        {bySpendingTypeChart ? (
          <PieChart data={bySpendingTypeChart} title={`FY${currentYear} by Spending Type`} townColor={town.primaryColor} />
        ) : (
          <BarChart categories={years.map(y => `FY${y}`)} series={trendSeries} title="Trend by Function" stacked />
        )}
      </div>
      {bySpendingTypeChart && (
        <BarChart categories={years.map(y => `FY${y}`)} series={trendSeries} title="Multi-Year Expense Trend by Function" stacked />
      )}

      <DynamicExpenseTable
        hierarchy={hierarchy}
        levelNames={levelNames}
        years={tableYears}
        currentYear={currentYear}
        townColor={town.primaryColor}
        lineItemTooltips={lineItemTooltips}
      />
    </div>
  );
}
