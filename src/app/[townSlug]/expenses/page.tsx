import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseAccountCodeConfig, DEFAULT_EXPENSE_LEVELS } from "@/lib/account-codes";
import { applySortOrder } from "@/lib/portal-sort";
import {
  groupAndSum,
  toChartData,
  detectCurrentAndPreviousYear,
} from "@/lib/aggregator";
import { formatCurrency, abbreviateCurrency, formatPercent, calculateChange } from "@/lib/format";
import SummaryTiles from "@/components/portal/SummaryTiles";
import PieChart from "@/components/portal/PieChart";
import BarChart from "@/components/portal/BarChart";
import ExpenseTable from "@/components/portal/ExpenseTable";
import ExportButton from "@/components/portal/ExportButton";
import type { SummaryTile } from "@/types";

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

  // Load sort preferences from account code config
  const acConfig = parseAccountCodeConfig(town.accountCodeRules || "");
  const expLevels = acConfig?.portalOrganization?.expenseLevels ?? DEFAULT_EXPENSE_LEVELS;
  const fnSort   = expLevels[0]?.sort ?? "total_desc";
  const deptSort = expLevels[1]?.sort ?? "total_desc";
  const catSort  = expLevels[2]?.sort ?? "total_desc";

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
    ? allRows.filter(
        (r) =>
          r.fiscalYear === prevYear &&
          (r.amountType === "budget" || r.amountType === "actual")
      )
    : [];

  const currentTotal = current.reduce((s, r) => s + r.amount, 0);
  const prevTotal = prev.reduce((s, r) => s + r.amount, 0);

  // ── KPI tiles ─────────────────────────────────────────────────────────────
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

  // Top function area
  const byFunction = groupAndSum(current, "functionArea");
  const topFn = Object.entries(byFunction).sort((a, b) => b[1] - a[1])[0];
  if (topFn) {
    tiles.push({
      label: "Largest Function",
      value: topFn[0],
      change: abbreviateCurrency(topFn[1]),
      changeType: "neutral",
    });
  }

  // Spending type breakdown tiles (if mapped)
  const bySpendingType = groupAndSum(
    current.filter((r) => r.category1),
    "category1"
  );
  const spendingTypeEntries = Object.entries(bySpendingType).sort((a, b) => b[1] - a[1]);
  for (const [type, amount] of spendingTypeEntries.slice(0, 3)) {
    const pct = currentTotal > 0 ? (amount / currentTotal) * 100 : 0;
    tiles.push({
      label: type,
      value: abbreviateCurrency(amount),
      change: `${pct.toFixed(1)}% of budget`,
      changeType: "neutral",
    });
  }

  // ── Chart data ──────────────────────────────────────────────────────────
  const byFunctionChart = toChartData(byFunction);
  const bySpendingTypeChart =
    spendingTypeEntries.length > 0 ? toChartData(bySpendingType) : null;

  const years = allYears.length > 0 ? allYears : [currentYear];
  const functions: string[] = [
    ...new Set(current.map((r) => r.functionArea || "Other")),
  ];
  const trendSeries = functions.slice(0, 8).map((fn) => ({
    label: fn,
    data: years.map((y) =>
      allRows
        .filter((r) => r.functionArea === fn && r.fiscalYear === y)
        .reduce((s, r) => s + r.amount, 0)
    ),
  }));

  // ── Build table data: fn → dept → line items ─────────────────────────────
  const tableYears = allYears.length > 0 ? allYears : [currentYear];

  type LineItem = {
    id: string;
    label: string;
    objectCode: string | null;
    amounts: Record<string, number>;
  };
  type Department = {
    name: string;
    amounts: Record<string, number>;
    categories: never[];
    items: LineItem[];
  };
  type FunctionGroup = {
    name: string;
    amounts: Record<string, number>;
    departments: Department[];
  };

  // Aggregate line totals per year
  const lineTotalsByYear = new Map<string, Map<string, number>>();
  const deptTotalsByYear = new Map<string, Map<string, number>>();
  const fnTotalsByYear = new Map<string, Map<string, number>>();

  for (const year of tableYears) {
    const yr = allRows.filter(
      (r) =>
        r.fiscalYear === year &&
        (year === currentYear
          ? r.amountType === "budget"
          : r.amountType === "budget" || r.amountType === "actual")
    );
    const lm = new Map<string, number>();
    const dm = new Map<string, number>();
    const fm = new Map<string, number>();
    for (const row of yr) {
      const fn = row.functionArea || "Other";
      const dept = row.department || "Other";
      const lineKey = `${fn}||${dept}||${row.objectCode || ""}||${row.lineItem || ""}`;
      lm.set(lineKey, (lm.get(lineKey) || 0) + row.amount);
      dm.set(`${fn}||${dept}`, (dm.get(`${fn}||${dept}`) || 0) + row.amount);
      fm.set(fn, (fm.get(fn) || 0) + row.amount);
    }
    lineTotalsByYear.set(year, lm);
    deptTotalsByYear.set(year, dm);
    fnTotalsByYear.set(year, fm);
  }

  const curFnMap = fnTotalsByYear.get(currentYear) || new Map<string, number>();
  const curDeptMap = deptTotalsByYear.get(currentYear) || new Map<string, number>();

  // Build function groups sorted by current total desc
  const fnGroups = new Map<string, typeof current>();
  for (const row of current) {
    const fn = row.functionArea || "Other";
    if (!fnGroups.has(fn)) fnGroups.set(fn, []);
    fnGroups.get(fn)!.push(row);
  }

  const functionData: FunctionGroup[] = [...fnGroups.keys()]
    .sort((a, b) => { switch(fnSort){case 'alpha_asc':return a.localeCompare(b);case 'alpha_desc':return b.localeCompare(a);case 'total_asc':return (curFnMap.get(a)||0)-(curFnMap.get(b)||0);default:return (curFnMap.get(b)||0)-(curFnMap.get(a)||0);} })
    .map((fn) => {
      const fnRows = fnGroups.get(fn)!;
      const deptMap = new Map<string, typeof current>();
      for (const row of fnRows) {
        const dept = row.department || "Other";
        if (!deptMap.has(dept)) deptMap.set(dept, []);
        deptMap.get(dept)!.push(row);
      }

      const departments: Department[] = [...deptMap.keys()]
        .sort((a, b) => { switch(deptSort){case 'alpha_asc':return a.localeCompare(b);case 'alpha_desc':return b.localeCompare(a);case 'total_asc':return (curDeptMap.get(`${fn}||${a}`)||0)-(curDeptMap.get(`${fn}||${b}`)||0);default:return (curDeptMap.get(`${fn}||${b}`)||0)-(curDeptMap.get(`${fn}||${a}`)||0);} })
        .map((dept) => {
          const deptRows = deptMap.get(dept)!;
          const items: LineItem[] = deptRows.map((row) => {
            const lineKey = `${fn}||${dept}||${row.objectCode || ""}||${row.lineItem || ""}`;
            const amounts: Record<string, number> = {};
            for (const y of tableYears) {
              amounts[y] = lineTotalsByYear.get(y)?.get(lineKey) || 0;
            }
            return {
              id: row.id,
              label: row.lineItem || row.objectCode || "",
              objectCode: row.objectCode,
              amounts,
            };
          }).sort((a, b) => {
            switch (catSort) {
              case "alpha_asc":  return a.label.localeCompare(b.label);
              case "alpha_desc": return b.label.localeCompare(a.label);
              case "total_asc":  return (a.amounts[currentYear] || 0) - (b.amounts[currentYear] || 0);
              default:           return (b.amounts[currentYear] || 0) - (a.amounts[currentYear] || 0);
            }
          });
          const amtsByYear: Record<string, number> = {};
          for (const y of tableYears) {
            amtsByYear[y] = deptTotalsByYear.get(y)?.get(`${fn}||${dept}`) || 0;
          }
          return {
            name: dept,
            amounts: amtsByYear,
            categories: [] as never[],
            items,
          };
        });

      const fnAmts: Record<string, number> = {};
      for (const y of tableYears) { fnAmts[y] = fnTotalsByYear.get(y)?.get(fn) || 0; }
      return {
        name: fn,
        amounts: fnAmts,
        departments,
      };
    });

  // Export
  const exportData = current.map((r) => {
    const lineKey = `${r.functionArea || "Other"}||${r.department || "Other"}||${r.objectCode || ""}||${r.lineItem || ""}`;
    const yearCols: Record<string, string> = {};
    for (const y of tableYears) {
      yearCols[`FY${y}`] = formatCurrency(lineTotalsByYear.get(y)?.get(lineKey) || 0);
    }
    return {
      "Function Area": r.functionArea || "",
      Department: r.department || "",
      "Spending Type": r.category1 || "",
      "Line Item": r.lineItem || "",
      Account: r.objectCode || "",
      ...yearCols,
    };
  });

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-gray-500 mt-1 text-sm">
            FY{currentYear} adopted budget · {current.length.toLocaleString()} line items
          </p>
        </div>
        <ExportButton
          data={exportData}
          filename={`${town.slug}-expenses-fy${currentYear}`}
        />
      </div>

      {/* KPI tiles */}
      <SummaryTiles tiles={tiles} tooltips={categoryTooltips} townColor={town.primaryColor} />

      {/* Charts */}
      <div className={`grid gap-4 ${bySpendingTypeChart ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1 md:grid-cols-2"}`}>
        <PieChart
          data={byFunctionChart}
          title={`FY${currentYear} by Function Area`}
          townColor={town.primaryColor}
        />
        {bySpendingTypeChart && (
          <PieChart
            data={bySpendingTypeChart}
            title={`FY${currentYear} by Spending Type`}
            townColor={town.primaryColor}
          />
        )}
        <BarChart
          categories={years.map((y) => `FY${y}`)}
          series={trendSeries}
          title="Multi-Year Trend by Function"
          stacked
        />
      </div>

      {/* Expense table */}
      <ExpenseTable
        functionGroups={functionData}
        years={tableYears}
        currentYear={currentYear}
        townColor={town.primaryColor}
        lineItemTooltips={lineItemTooltips}
      />
    </div>
  );
}
