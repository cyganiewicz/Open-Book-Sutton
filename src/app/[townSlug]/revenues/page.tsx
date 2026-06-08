import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { formatCurrency, abbreviateCurrency, calculateChange, formatPercent } from "@/lib/format";
import { parseAccountCodeConfig, DEFAULT_REVENUE_LEVELS } from "@/lib/account-codes";
import ExportButton from "@/components/portal/ExportButton";
import RevenueHeader, { type RevHierarchyNode } from "@/components/portal/RevenueHeader";
import RevenueTable from "@/components/portal/RevenueTable";

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

  const current = allRows.filter(r => r.fiscalYear === currentYear && r.amountType === "budget");
  const prev = previousYear
    ? allRows.filter(r => r.fiscalYear === previousYear && (r.amountType === "actual" || r.amountType === "budget"))
    : [];

  const totalRevenue = current.reduce((s, r) => s + r.amount, 0);
  const prevTotal = prev.reduce((s, r) => s + r.amount, 0);

  // ── Build hierarchy from portal organization levels ─────────────────────
  // Revenue typically: category1 → category2 → line items
  // Use the configured revLevels to determine grouping fields

  type RowType = typeof current[0];

  function getRevField(row: RowType, field: string): string {
    const v = row[field as keyof RowType];
    return (v != null && v !== "") ? String(v) : "";
  }

  function getYearAmounts(
    matchFn: (r: RowType) => boolean
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const y of tableYears) {
      out[y] = allRows
        .filter(r =>
          matchFn(r) &&
          r.fiscalYear === y &&
          (y === currentYear ? r.amountType === "budget" : r.amountType === "budget" || r.amountType === "actual")
        )
        .reduce((s, r) => s + r.amount, 0);
    }
    return out;
  }

  function sortByLevel(entries: [string, RowType[]][], levelIdx: number): [string, RowType[]][] {
    const level = revLevels[levelIdx];
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
    ancestorMatchFn: (r: RowType) => boolean
  ): RevHierarchyNode[] {
    if (levelIdx >= revLevels.length || rows.length === 0) return [];
    const level = revLevels[levelIdx];
    const isLast = levelIdx === revLevels.length - 1;

    const groups = new Map<string, RowType[]>();
    for (const row of rows) {
      const val = getRevField(row, level.dataField) || (level.skipIfEmpty ? "" : "Other");
      if (!val && level.skipIfEmpty) continue;
      const key = val || "Other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const sorted = sortByLevel([...groups.entries()], levelIdx);
    const nodes: RevHierarchyNode[] = [];

    for (const [key, groupRows] of sorted) {
      const nodeMatchFn = (r: RowType) => ancestorMatchFn(r) && getRevField(r, level.dataField) === key;
      const amounts = getYearAmounts(nodeMatchFn);

      if (isLast) {
        // Show line items as leaves
        // Match across years by lineItem + category1 + category2 (not by id)
        const leafRows = groupRows.map(row => ({
          id: row.id,
          label: row.lineItem || row.category2 || row.category1 || "",
          amounts: getYearAmounts(r =>
            r.lineItem === row.lineItem &&
            r.category1 === row.category1 &&
            r.category2 === row.category2
          ),
        }));
        nodes.push({ key, amounts, isLeaf: true, children: [], rows: leafRows });
      } else {
        const children = buildLevel(groupRows, levelIdx + 1, nodeMatchFn);
        nodes.push({ key, amounts, isLeaf: false, children, rows: [] });
      }
    }

    // Rows that skipped this level — pass through to next level
    const skipped = level.skipIfEmpty ? rows.filter(r => !getRevField(r, level.dataField)) : [];
    if (skipped.length > 0 && !isLast) {
      nodes.push(...buildLevel(skipped, levelIdx + 1, ancestorMatchFn));
    }

    return nodes;
  }

  const hierarchy = buildLevel(current, 0, () => true);
  const levelNames = revLevels.map(l => l.name);

  // Export
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Revenues</h1>
          <p className="text-gray-500 mt-1 text-sm">
            FY{currentYear} adopted budget · {current.length.toLocaleString()} line items
          </p>
        </div>
        <ExportButton data={exportData} filename={`${town.slug}-revenues-fy${currentYear}`} />
      </div>

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
        townColor={town.primaryColor}
        totalRevenue={totalRevenue}
        levelNames={levelNames}
      />
    </div>
  );
}
