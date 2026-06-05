import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { groupAndSum, toChartData, detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { formatCurrency, abbreviateCurrency, formatPercent, calculateChange } from "@/lib/format";
import SummaryTiles from "@/components/portal/SummaryTiles";
import PieChart from "@/components/portal/PieChart";
import BarChart from "@/components/portal/BarChart";
import ExpenseTable from "@/components/portal/ExpenseTable";
import ExportButton from "@/components/portal/ExportButton";
import type { SummaryTile } from "@/types";

// Stable key for a budget row — used consistently for aggregation + lookup
function rowKey(fn: string, dept: string, cat1: string, cat2: string, obj: string, desc: string) {
  return `${fn}|||${dept}|||${cat1}|||${cat2}|||${obj}|||${desc}`;
}

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

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
    tiles.push({
      label: "Largest Function",
      value: topFn[0],
      change: abbreviateCurrency(topFn[1]),
      changeType: "neutral",
    });
  }
  const bySpendingType = groupAndSum(current.filter((r) => r.category1), "category1");
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

  // ── Charts ─────────────────────────────────────────────────────────────
  const byFunctionChart = toChartData(byFunction);
  const bySpendingTypeChart = spendingTypeEntries.length > 0 ? toChartData(bySpendingType) : null;
  const years = allYears.length > 0 ? allYears : [currentYear];
  const functions: string[] = [...new Set(current.map((r) => r.functionArea || "Other"))];
  const trendSeries = functions.slice(0, 8).map((fn) => ({
    label: fn,
    data: years.map((y) =>
      allRows.filter((r) => r.functionArea === fn && r.fiscalYear === y).reduce((s, r) => s + r.amount, 0)
    ),
  }));

  // ── Aggregate by year at every level using a consistent key scheme ─────
  const tableYears = allYears.length > 0 ? allYears : [currentYear];

  // year → key → total
  const fnYearTotals = new Map<string, Map<string, number>>();
  const deptYearTotals = new Map<string, Map<string, number>>();
  const cat1YearTotals = new Map<string, Map<string, number>>();
  const cat2YearTotals = new Map<string, Map<string, number>>();
  const lineYearTotals = new Map<string, Map<string, number>>();

  for (const year of tableYears) {
    const yr = allRows.filter(
      (r) =>
        r.fiscalYear === year &&
        (year === currentYear
          ? r.amountType === "budget"
          : r.amountType === "budget" || r.amountType === "actual")
    );
    const fm = new Map<string, number>();
    const dm = new Map<string, number>();
    const c1m = new Map<string, number>();
    const c2m = new Map<string, number>();
    const lm = new Map<string, number>();

    for (const row of yr) {
      const fn = row.functionArea || "Other";
      const dept = row.department || "Other";
      const cat1 = row.category1 || "";
      const cat2 = row.category2 || "";
      const obj = row.objectCode || "";
      const desc = row.lineItem || "";
      const lk = rowKey(fn, dept, cat1, cat2, obj, desc);

      fm.set(fn, (fm.get(fn) || 0) + row.amount);
      dm.set(`${fn}|||${dept}`, (dm.get(`${fn}|||${dept}`) || 0) + row.amount);
      if (cat1) c1m.set(`${fn}|||${dept}|||${cat1}`, (c1m.get(`${fn}|||${dept}|||${cat1}`) || 0) + row.amount);
      if (cat1 && cat2) c2m.set(`${fn}|||${dept}|||${cat1}|||${cat2}`, (c2m.get(`${fn}|||${dept}|||${cat1}|||${cat2}`) || 0) + row.amount);
      lm.set(lk, (lm.get(lk) || 0) + row.amount);
    }
    fnYearTotals.set(year, fm);
    deptYearTotals.set(year, dm);
    cat1YearTotals.set(year, c1m);
    cat2YearTotals.set(year, c2m);
    lineYearTotals.set(year, lm);
  }

  const curFn = fnYearTotals.get(currentYear) || new Map<string, number>();
  const curDept = deptYearTotals.get(currentYear) || new Map<string, number>();

  // Helper: build amounts object across all years for a given key resolver
  const amts = (keyForYear: (y: string) => string, map: Map<string, Map<string, number>>) => {
    const out: Record<string, number> = {};
    for (const y of tableYears) out[y] = map.get(y)?.get(keyForYear(y)) || 0;
    return out;
  };

  // ── Build typed hierarchy ───────────────────────────────────────────────
  type ExpLineItem = { id: string; label: string; objectCode: string | null; amounts: Record<string, number> };
  type ExpCat2 = { name: string; amounts: Record<string, number>; items: ExpLineItem[] };
  type ExpCat1 = { name: string; amounts: Record<string, number>; subCategories: ExpCat2[]; items: ExpLineItem[] };
  type ExpDept = { name: string; amounts: Record<string, number>; categories: ExpCat1[]; items: ExpLineItem[] };
  type ExpFn = { name: string; amounts: Record<string, number>; departments: ExpDept[] };

  // Group current rows into fn → dept → cat1 → cat2 → line
  const fnGroups = new Map<string, typeof current>();
  for (const row of current) {
    const fn = row.functionArea || "Other";
    if (!fnGroups.has(fn)) fnGroups.set(fn, []);
    fnGroups.get(fn)!.push(row);
  }

  const functionData: ExpFn[] = [...fnGroups.keys()]
    .sort((a, b) => (curFn.get(b) || 0) - (curFn.get(a) || 0))
    .map((fn) => {
      const fnRows = fnGroups.get(fn)!;
      const deptGroups = new Map<string, typeof current>();
      for (const row of fnRows) {
        const dept = row.department || "Other";
        if (!deptGroups.has(dept)) deptGroups.set(dept, []);
        deptGroups.get(dept)!.push(row);
      }

      const departments: ExpDept[] = [...deptGroups.keys()]
        .sort((a, b) => (curDept.get(`${fn}|||${b}`) || 0) - (curDept.get(`${fn}|||${a}`) || 0))
        .map((dept) => {
          const deptRows = deptGroups.get(dept)!;
          const hasCat1 = deptRows.some((r) => r.category1);

          if (!hasCat1) {
            return {
              name: dept,
              amounts: amts(() => `${fn}|||${dept}`, deptYearTotals),
              categories: [] as ExpCat1[],
              items: deptRows.map((row) => ({
                id: row.id,
                label: row.lineItem || row.objectCode || "",
                objectCode: row.objectCode,
                amounts: amts(() => rowKey(fn, dept, "", "", row.objectCode || "", row.lineItem || ""), lineYearTotals),
              })),
            };
          }

          // Group by cat1
          const cat1Groups = new Map<string, typeof current>();
          for (const row of deptRows) {
            const c1 = row.category1 || "";
            if (!cat1Groups.has(c1)) cat1Groups.set(c1, []);
            cat1Groups.get(c1)!.push(row);
          }

          const categories: ExpCat1[] = [...cat1Groups.entries()]
            .sort((a, b) => (cat1YearTotals.get(currentYear)?.get(`${fn}|||${dept}|||${b[0]}`) || 0) - (cat1YearTotals.get(currentYear)?.get(`${fn}|||${dept}|||${a[0]}`) || 0))
            .map(([cat1, c1rows]) => {
              const hasCat2 = c1rows.some((r) => r.category2);
              const cat1Amts = amts(() => `${fn}|||${dept}|||${cat1}`, cat1YearTotals);

              if (!hasCat2) {
                return {
                  name: cat1,
                  amounts: cat1Amts,
                  subCategories: [] as ExpCat2[],
                  items: c1rows.map((row) => ({
                    id: row.id,
                    label: row.lineItem || row.objectCode || "",
                    objectCode: row.objectCode,
                    amounts: amts(() => rowKey(fn, dept, cat1, "", row.objectCode || "", row.lineItem || ""), lineYearTotals),
                  })),
                };
              }

              const cat2Groups = new Map<string, typeof current>();
              for (const row of c1rows) {
                const c2 = row.category2 || "";
                if (!cat2Groups.has(c2)) cat2Groups.set(c2, []);
                cat2Groups.get(c2)!.push(row);
              }

              return {
                name: cat1,
                amounts: cat1Amts,
                subCategories: [...cat2Groups.entries()]
                  .sort((a, b) => (cat2YearTotals.get(currentYear)?.get(`${fn}|||${dept}|||${cat1}|||${b[0]}`) || 0) - (cat2YearTotals.get(currentYear)?.get(`${fn}|||${dept}|||${cat1}|||${a[0]}`) || 0))
                  .map(([cat2, c2rows]) => ({
                    name: cat2,
                    amounts: amts(() => `${fn}|||${dept}|||${cat1}|||${cat2}`, cat2YearTotals),
                    items: c2rows.map((row) => ({
                      id: row.id,
                      label: row.lineItem || row.objectCode || "",
                      objectCode: row.objectCode,
                      amounts: amts(() => rowKey(fn, dept, cat1, cat2, row.objectCode || "", row.lineItem || ""), lineYearTotals),
                    })),
                  })),
                items: [] as ExpLineItem[],
              };
            });

          return {
            name: dept,
            amounts: amts(() => `${fn}|||${dept}`, deptYearTotals),
            categories,
            items: [] as ExpLineItem[],
          };
        });

      return {
        name: fn,
        amounts: amts((y) => fn, fnYearTotals),
        departments,
      };
    });

  // Export
  const exportData = current.map((r) => {
    const fn = r.functionArea || "Other";
    const dept = r.department || "Other";
    const cat1 = r.category1 || "";
    const cat2 = r.category2 || "";
    const obj = r.objectCode || "";
    const desc = r.lineItem || "";
    const lk = rowKey(fn, dept, cat1, cat2, obj, desc);
    const yearCols: Record<string, string> = {};
    for (const y of tableYears) yearCols[`FY${y}`] = formatCurrency(lineYearTotals.get(y)?.get(lk) || 0);
    return { "Function Area": fn, Department: dept, "Spending Type": cat1, Subcategory: cat2, "Line Item": desc, Account: obj, ...yearCols };
  });

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

      <div className={`grid gap-4 ${bySpendingTypeChart ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"}`}>
        <PieChart data={byFunctionChart} title={`FY${currentYear} by Function Area`} townColor={town.primaryColor} />
        {bySpendingTypeChart && (
          <PieChart data={bySpendingTypeChart} title={`FY${currentYear} by Spending Type`} townColor={town.primaryColor} />
        )}
        <BarChart categories={years.map((y) => `FY${y}`)} series={trendSeries} title="Trend by Function" stacked />
      </div>

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
