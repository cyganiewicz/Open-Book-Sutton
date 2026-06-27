export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { formatCurrency } from "@/lib/format";
import { parseAccountCodeConfig, DEFAULT_REVENUE_LEVELS, resolveRevenueCategory } from "@/lib/account-codes";
import RevenueHeader, { type RevHierarchyNode } from "@/components/portal/RevenueHeader";
import RevenueTable from "@/components/portal/RevenueTable";
import FinancialPageHeader from "@/components/portal/FinancialPageHeader";

export default async function RevenuesPage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

  const acConfig = parseAccountCodeConfig(town.accountCodeRules || "");
  const revLevels = acConfig?.portalOrganization?.revenueLevels ?? DEFAULT_REVENUE_LEVELS;

  const allRows = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "revenues" },
  });

  const { currentYear, previousYear, allYears } = detectCurrentAndPreviousYear(allRows);
  const tableYears = allYears.length > 0 ? allYears : [currentYear];

  // Reclassify at render time — account code changes reflect immediately
  function reclassify<T extends { objectCode: string | null; category1: string | null; category2: string | null }>(row: T): T {
    if (!acConfig?.revenueConfig) return row;
    const derived = resolveRevenueCategory(row.objectCode, acConfig.revenueConfig);
    return {
      ...row,
      category1: derived.category1 || row.category1,
      category2: derived.category2 || row.category2,
    };
  }

  const allRowsClassified = allRows.map(reclassify);

  // Determine preferred type per year
  const yearTypes: Record<string, "budget" | "actual"> = {};
  for (const y of tableYears) {
    if (y === currentYear) {
      yearTypes[y] = "budget";
    } else {
      const hasActual = allRowsClassified.some(r => r.fiscalYear === y && r.amountType === "actual");
      yearTypes[y] = hasActual ? "actual" : "budget";
    }
  }

  // Build year+type column options for the table
  const yearTypeOptions: { year: string; type: "budget" | "actual"; label: string; colKey: string }[] = [];
  for (const y of tableYears) {
    const hasBudget = allRowsClassified.some(r => r.fiscalYear === y && r.amountType === "budget");
    const hasActual = allRowsClassified.some(r => r.fiscalYear === y && r.amountType === "actual");
    if (hasBudget) yearTypeOptions.push({ year: y, type: "budget", label: `FY${y} Budget`, colKey: `${y}:budget` });
    if (hasActual) yearTypeOptions.push({ year: y, type: "actual", label: `FY${y} Actual`, colKey: `${y}:actual` });
  }

  const current = allRowsClassified.filter(r => r.fiscalYear === currentYear && r.amountType === "budget");
  const prev = previousYear
    ? allRowsClassified.filter(r => r.fiscalYear === previousYear && r.amountType === (yearTypes[previousYear] ?? "budget"))
    : [];

  const totalRevenue = current.reduce((s, r) => s + r.amount, 0);
  const prevTotal = prev.reduce((s, r) => s + r.amount, 0);

  type RowType = typeof current[0];

  function getRevField(row: RowType, field: string): string {
    const v = row[field as keyof RowType];
    return (v != null && v !== "") ? String(v) : "";
  }

  // amounts[year] = preferred type for that year (for charts/sorting)
  // amounts[year:budget] and amounts[year:actual] = explicit types for table columns
  function getYearAmounts(matchFn: (r: RowType) => boolean): Record<string, number> {
    const out: Record<string, number> = {};
    for (const y of tableYears) {
      const preferredType = y === currentYear ? "budget" : (yearTypes[y] ?? "budget");
      const primary = allRowsClassified
        .filter(r => matchFn(r) && r.fiscalYear === y && r.amountType === preferredType)
        .reduce((s, r) => s + r.amount, 0);
      if (primary) out[y] = primary;
      // Also store explicit budget/actual for column switching
      for (const t of ["budget", "actual"] as const) {
        const val = allRowsClassified
          .filter(r => matchFn(r) && r.fiscalYear === y && r.amountType === t)
          .reduce((s, r) => s + r.amount, 0);
        if (val) out[`${y}:${t}`] = val;
      }
    }
    return out;
  }

  function sortByLevel(entries: [string, RowType[]][], levelIdx: number, levels = revLevels): [string, RowType[]][] {
    const level = levels[levelIdx];
    if (!level) return entries;
    return [...entries].sort((a, b) => {
      switch (level.sort) {
        case "alpha_asc":  return a[0].localeCompare(b[0]);
        case "alpha_desc": return b[0].localeCompare(a[0]);
        case "total_asc":  return a[1].reduce((s, r) => s + r.amount, 0) - b[1].reduce((s, r) => s + r.amount, 0);
        default:           return b[1].reduce((s, r) => s + r.amount, 0) - a[1].reduce((s, r) => s + r.amount, 0);
      }
    });
  }

  function buildLevel(
    rows: RowType[],
    levelIdx: number,
    ancestorMatchFn: (r: RowType) => boolean,
    levels = revLevels
  ): RevHierarchyNode[] {
    if (levelIdx >= levels.length || rows.length === 0) return [];
    const level = levels[levelIdx];
    const isLast = levelIdx === levels.length - 1;

    const groups = new Map<string, RowType[]>();
    for (const row of rows) {
      const val = getRevField(row, level.dataField) || (level.skipIfEmpty ? "" : "Other");
      if (!val && level.skipIfEmpty) continue;
      const key = val || "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const sorted = sortByLevel([...groups.entries()], levelIdx, levels);
    const nodes: RevHierarchyNode[] = [];

    for (const [key, groupRows] of sorted) {
      const nodeMatchFn = (r: RowType) => ancestorMatchFn(r) && getRevField(r, level.dataField) === key;
      const amounts = getYearAmounts(nodeMatchFn);

      if (isLast) {
        const leafRows = groupRows.map(row => ({
          id: row.id,
          label: row.lineItem || row.category2 || row.category1 || "",
          amounts: getYearAmounts(r =>
            nodeMatchFn(r) &&
            r.lineItem === row.lineItem &&
            r.category1 === row.category1 &&
            r.category2 === row.category2
          ),
        }));
        nodes.push({ key, amounts, isLeaf: true, children: [], rows: leafRows });
      } else {
        const children = buildLevel(groupRows, levelIdx + 1, nodeMatchFn, levels);
        nodes.push({ key, amounts, isLeaf: false, children, rows: [] });
      }
    }

    const skipped = level.skipIfEmpty ? rows.filter(r => !getRevField(r, level.dataField)) : [];
    if (skipped.length > 0) {
      if (isLast) {
        // Unmapped rows at leaf level — show under (Uncategorized) so they appear in the table
        const leafRows = skipped.map(row => ({
          id: row.id,
          label: row.lineItem || row.category2 || row.category1 || row.objectCode || "(Unmapped)",
          amounts: getYearAmounts(r =>
            r.lineItem === row.lineItem &&
            r.category1 === row.category1 &&
            r.category2 === row.category2 &&
            r.objectCode === row.objectCode
          ),
        }));
        const uncat = nodes.find(n => n.key === "(Uncategorized)");
        if (uncat) {
          uncat.rows = [...(uncat.rows || []), ...leafRows];
        } else {
          const amounts = getYearAmounts(r => skipped.some(s =>
            s.lineItem === r.lineItem && s.category1 === r.category1 &&
            s.category2 === r.category2 && s.objectCode === r.objectCode
          ));
          nodes.push({ key: "(Uncategorized)", amounts, isLeaf: true, children: [], rows: leafRows });
        }
      } else {
        nodes.push(...buildLevel(skipped, levelIdx + 1, ancestorMatchFn, levels));
      }
    }

    return nodes;
  }

  let hierarchy = buildLevel(current, 0, () => true);
  let levelNames = revLevels.map(l => l.name);

  // Fallback if configured levels produce nothing
  if (hierarchy.length === 0 || hierarchy.every(n => (n.amounts[currentYear] || 0) === 0)) {
    hierarchy = buildLevel(current, 0, () => true, DEFAULT_REVENUE_LEVELS);
    levelNames = DEFAULT_REVENUE_LEVELS.map(l => l.name);
  }

  const exportData = current.map(r => {
    const row: Record<string, string> = {
      Category: r.category1 || "",
      Subcategory: r.category2 || "",
      Description: r.lineItem || "",
    };
    for (const y of tableYears) {
      const amt = allRows.find(ar =>
        ar.lineItem === r.lineItem && ar.category1 === r.category1 &&
        ar.category2 === r.category2 && ar.fiscalYear === y
      )?.amount || 0;
      row[`FY${y}`] = formatCurrency(amt);
    }
    return row;
  });

  const tooltipRows = await prisma.tooltip.findMany({ where: { townId: town.id } });
  const lineItemTooltips: Record<string, string> = {};
  const categoryTooltips: Record<string, string> = {};
  for (const t of tooltipRows) {
    if (t.scope === "line-item") lineItemTooltips[t.key] = t.text;
    if (t.scope === "category") categoryTooltips[t.key] = t.text;
  }

  return (
    <div className="space-y-0">
      <FinancialPageHeader
        title="Revenues"
        fiscalYear={currentYear}
        itemCount={current.length}
        description="See how Sutton funds municipal services through taxes, state aid, local receipts, and other sources."
        exportData={exportData}
        exportFilename={`${town.slug}-revenues-fy${currentYear}`}
      />

      <div className="space-y-8">
      <RevenueHeader
        hierarchy={hierarchy}
        years={tableYears}
        currentYear={currentYear}
        townColor={town.primaryColor}
        totalRevenue={totalRevenue}
        prevTotal={prevTotal}
      />

      <RevenueTable
        hierarchy={hierarchy}
        years={tableYears}
        currentYear={currentYear}
        yearTypes={yearTypes}
        yearTypeOptions={yearTypeOptions}
        townColor={town.primaryColor}
        totalRevenue={totalRevenue}
        levelNames={levelNames}
        lineItemTooltips={lineItemTooltips}
        categoryTooltips={categoryTooltips}
      />
      </div>
    </div>
  );
}
