export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { groupAndSum, detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
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
import FinancialPageHeader from "@/components/portal/FinancialPageHeader";

// ── Types ─────────────────────────────────────────────────────────────────
type BudgetRowLike = {
  id: string;
  fiscalYear: string;
  amountType: string;
  amount: number;
  objectCode: string | null;
  lineItem: string | null;
  department: string | null;
  functionArea: string | null;
  category1: string | null;
  category2: string | null;
  fundCode: string | null;
  fundName: string | null;
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

export function annotateSpendingTypes(
  nodes: HierarchyNode[],
  tableYears: string[],
  segments?: import("@/lib/account-codes").AccountSegment[],
  spendingTypeSegIdx?: number | null
): HierarchyNode[] {
  function getType(objectCode: string | null): string | null {
    if (!objectCode) return null;
    if (segments && spendingTypeSegIdx !== null && spendingTypeSegIdx !== undefined) {
      const cfg = { segments, spendingTypeSegment: spendingTypeSegIdx, separator: "-" } as import("@/lib/account-codes").AccountCodeConfig;
      const resolved = resolveSpendingType(objectCode, cfg);
      if (resolved) return resolved;
    }
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
      for (const [k, v] of Object.entries(row.amounts)) {
        spendingTypeTotals[type][k] = (spendingTypeTotals[type][k] || 0) + v;
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
  ancestorFilter: (r: BudgetRowLike) => boolean,
  yearTypes: Record<string, "budget" | "actual"> = {}
): HierarchyNode[] {
  if (levelIndex >= levels.length || currentRows.length === 0) return [];

  const level = levels[levelIndex];
  const isLastLevel = levelIndex === levels.length - 1;

  const makeLeafRows = (rows: BudgetRowLike[]) =>
    rows.map(row => {
      const acct = row.objectCode || "";
      const desc = row.lineItem || "";
      const amounts: Record<string, number> = {};
      for (const y of tableYears) {
        const preferredType = y === currentYear ? "budget" : (yearTypes[y] ?? "budget");
        const primary = allYearRows
          .filter(r => r.objectCode === acct && r.lineItem === desc && r.fiscalYear === y && r.amountType === preferredType)
          .reduce((s, r) => s + r.amount, 0);
        if (primary) amounts[y] = primary;
        for (const t of ["budget", "actual"] as const) {
          const val = allYearRows
            .filter(r => r.objectCode === acct && r.lineItem === desc && r.fiscalYear === y && r.amountType === t)
            .reduce((s, r) => s + r.amount, 0);
          if (val) amounts[`${y}:${t}`] = val;
        }
      }
      return {
        id: row.id,
        label: row.lineItem || row.objectCode || "",
        objectCode: row.objectCode,
        amounts,
      };
    });

  const sumAmounts = (filter: (r: BudgetRowLike) => boolean): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const y of tableYears) {
      const preferredType = y === currentYear ? "budget" : (yearTypes[y] ?? "budget");
      const primary = allYearRows
        .filter(r => filter(r) && r.fiscalYear === y && r.amountType === preferredType)
        .reduce((s, r) => s + r.amount, 0);
      if (primary) out[y] = primary;
      for (const t of ["budget", "actual"] as const) {
        const val = allYearRows
          .filter(r => filter(r) && r.fiscalYear === y && r.amountType === t)
          .reduce((s, r) => s + r.amount, 0);
        if (val) out[`${y}:${t}`] = val;
      }
    }
    return out;
  };

  const withValue = currentRows.filter(r => getField(r, level.dataField) !== "");
  const withoutValue = level.skipIfEmpty
    ? currentRows.filter(r => getField(r, level.dataField) === "")
    : [];

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
        groupRows, allYearRows, levels, levelIndex + 1, tableYears, currentYear, nodeFilter, yearTypes
      );
      nodes.push({ key, amounts, isLeaf: false, children, rows: [] });
    }
  }

  if (withoutValue.length > 0) {
    if (isLastLevel) {
      const amounts = sumAmounts(r =>
        withoutValue.some(w =>
          w.objectCode === r.objectCode && w.lineItem === r.lineItem &&
          w.department === r.department && w.functionArea === r.functionArea
        )
      );
      nodes.push({ key: "_direct", amounts, isLeaf: true, children: [], rows: makeLeafRows(withoutValue) });
    } else {
      const skipped = buildHierarchyV2(
        withoutValue, allYearRows, levels, levelIndex + 1, tableYears, currentYear, ancestorFilter, yearTypes
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
  const lineItemTooltips: Record<string, string> = {};
  for (const t of tooltipRows) {
    if (t.scope === "line-item") lineItemTooltips[t.key] = t.text;
  }

  const allRows = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "expenses" },
  });

  const { currentYear, previousYear, allYears } = detectCurrentAndPreviousYear(allRows);

  function reclassifyExpense<T extends {
    objectCode: string | null; functionArea: string | null;
    department: string | null; category1: string | null; category2: string | null;
  }>(row: T): T {
    if (!acConfig) return row;
    const d = applyAccountCodeConfig(row.objectCode, row.department, acConfig);
    return {
      ...row,
      functionArea: d.functionArea || row.functionArea,
      department: d.department || row.department,
      category1: d.category1 || row.category1,
      category2: d.category2 || row.category2,
    };
  }

  const allRowsClassified = allRows.map(reclassifyExpense);
  const tableYears = allYears.length > 0 ? allYears : [currentYear];

  const yearTypes: Record<string, "budget" | "actual"> = {};
  for (const y of tableYears) {
    if (y === currentYear) {
      yearTypes[y] = "budget";
    } else {
      const hasActual = allRowsClassified.some(r => r.fiscalYear === y && r.amountType === "actual");
      yearTypes[y] = hasActual ? "actual" : "budget";
    }
  }

  const allYearTotals: Record<string, number> = {};
  for (const y of tableYears) {
    const t = y === currentYear ? "budget" : (yearTypes[y] ?? "budget");
    allYearTotals[y] = allRowsClassified
      .filter(r => r.fiscalYear === y && r.amountType === t)
      .reduce((s, r) => s + r.amount, 0);
  }

  const current = allRowsClassified.filter(
    (r) => r.fiscalYear === currentYear && r.amountType === "budget"
  );
  const currentTotal = current.reduce((s, r) => s + r.amount, 0);

  const prevYear = previousYear;
  const prev = prevYear
    ? allRowsClassified.filter(r => r.fiscalYear === prevYear && r.amountType === (yearTypes[prevYear] ?? "budget"))
    : [];
  const prevTotal = prev.reduce((s, r) => s + r.amount, 0);

  const yearTypeOptions: { year: string; type: "budget" | "actual"; label: string; colKey: string }[] = [];
  for (const y of tableYears) {
    const hasBudget = allRowsClassified.some(r => r.fiscalYear === y && r.amountType === "budget");
    const hasActual = allRowsClassified.some(r => r.fiscalYear === y && r.amountType === "actual");
    if (hasBudget) yearTypeOptions.push({ year: y, type: "budget", label: `FY${y} Budget`, colKey: `${y}:budget` });
    if (hasActual) yearTypeOptions.push({ year: y, type: "actual", label: `FY${y} Actual`, colKey: `${y}:actual` });
  }

  const byFunction = groupAndSum(current, "functionArea");
  const topFn = Object.entries(byFunction).sort((a, b) => b[1] - a[1])[0];
  const tiles: SummaryTile[] = [
    { label: "Total Budget", value: abbreviateCurrency(currentTotal) },
    ...(topFn ? [{ label: "Largest Function", value: topFn[0], sub: abbreviateCurrency(topFn[1]) }] : []),
  ];

  const allRowsTyped = allRowsClassified as BudgetRowLike[];
  const currentTyped = current as BudgetRowLike[];

  const hierarchyRaw = buildHierarchyV2(
    currentTyped,
    allRowsTyped,
    expLevels,
    0,
    tableYears,
    currentYear,
    () => true,
    yearTypes
  );
  const hierarchy = annotateSpendingTypes(
    hierarchyRaw, tableYears,
    acConfig?.segments ?? [],
    acConfig?.spendingTypeSegment ?? null
  );

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
    <div className="space-y-0">
      <FinancialPageHeader
        title="Expenses"
        fiscalYear={currentYear}
        itemCount={current.length}
        description="Explore how Sutton allocates resources across services, departments, and programs."
        exportData={exportData}
        exportFilename={`${town.slug}-expenses-fy${currentYear}`}
      />

      <div className="space-y-8">
        <ExpenseHeader
          tiles={tiles}
          hierarchy={hierarchy}
          years={tableYears}
          currentYear={currentYear}
          townColor={town.primaryColor || "#2d6a4f"}
          totalBudget={currentTotal}
          prevTotal={prevTotal}
          spendingTypeSegmentIndex={acConfig?.spendingTypeSegment ?? null}
          accountSegments={acConfig?.segments ?? []}
          allYearTotals={allYearTotals}
        />

        <DynamicExpenseTable
          hierarchy={hierarchy}
          levelNames={levelNames}
          years={tableYears}
          currentYear={currentYear}
          yearTypes={yearTypes}
          yearTypeOptions={yearTypeOptions}
          townColor={town.primaryColor || "#2d6a4f"}
          lineItemTooltips={lineItemTooltips}
        />
      </div>
    </div>
  );
}
