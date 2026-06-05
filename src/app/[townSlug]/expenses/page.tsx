import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  groupAndSum,
  toChartData,
  buildExpenseKpiTiles,
  detectCurrentAndPreviousYear,
} from "@/lib/aggregator";
import { formatCurrency } from "@/lib/format";
import SummaryTiles from "@/components/portal/SummaryTiles";
import PieChart from "@/components/portal/PieChart";
import BarChart from "@/components/portal/BarChart";
import BudgetTable from "@/components/portal/BudgetTable";
import ExportButton from "@/components/portal/ExportButton";

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

  const tiles = buildExpenseKpiTiles(current, prev);
  const byFunction = toChartData(groupAndSum(current, "functionArea"));

  const years = allYears.length > 0 ? allYears : [currentYear];
  const functions = [...new Set(current.map((r) => r.functionArea || "Other"))];
  const trendSeries = functions.slice(0, 8).map((fn) => ({
    label: fn,
    data: years.map((y) =>
      allRows
        .filter((r) => r.functionArea === fn && r.fiscalYear === y)
        .reduce((s, r) => s + r.amount, 0)
    ),
  }));

  // ── Build hierarchical table rows ────────────────────────────────────────
  // Hierarchy: Function Area → Department → [Category1 → Category2 →] Line Item
  // Sorted: function areas by total desc, departments by total desc within each fn

  type TableRow = {
    id: string;
    cells: (string | number | null)[];
    isGroup?: boolean;
    isSubtotal?: boolean;
    isSub2?: boolean;
    depth?: number;
    groupKey?: string;
    parentKey?: string;
  };

  const tableYears = allYears.length > 0 ? allYears : [currentYear];

  // Precompute totals for each year at each level
  const fnTotalsByYear = new Map<string, Map<string, number>>();
  const deptTotalsByYear = new Map<string, Map<string, number>>();
  const cat1TotalsByYear = new Map<string, Map<string, number>>();
  const cat2TotalsByYear = new Map<string, Map<string, number>>();
  const lineTotalsByYear = new Map<string, Map<string, number>>();

  for (const year of tableYears) {
    const yearRows = allRows.filter(
      (r) =>
        r.fiscalYear === year &&
        (year === currentYear
          ? r.amountType === "budget"
          : r.amountType === "budget" || r.amountType === "actual")
    );
    const fnMap = new Map<string, number>();
    const deptMap = new Map<string, number>();
    const cat1Map = new Map<string, number>();
    const cat2Map = new Map<string, number>();
    const lineMap = new Map<string, number>();

    for (const row of yearRows) {
      const fn = row.functionArea || "Other";
      const dept = row.department || "Other";
      const cat1 = row.category1 || "";
      const cat2 = row.category2 || "";
      const lineKey = `${fn}|${dept}|${cat1}|${cat2}|${row.objectCode || ""}|${row.lineItem || ""}`;

      fnMap.set(fn, (fnMap.get(fn) || 0) + row.amount);
      deptMap.set(`${fn}|${dept}`, (deptMap.get(`${fn}|${dept}`) || 0) + row.amount);
      if (cat1) cat1Map.set(`${fn}|${dept}|${cat1}`, (cat1Map.get(`${fn}|${dept}|${cat1}`) || 0) + row.amount);
      if (cat2) cat2Map.set(`${fn}|${dept}|${cat1}|${cat2}`, (cat2Map.get(`${fn}|${dept}|${cat1}|${cat2}`) || 0) + row.amount);
      lineMap.set(lineKey, (lineMap.get(lineKey) || 0) + row.amount);
    }
    fnTotalsByYear.set(year, fnMap);
    deptTotalsByYear.set(year, deptMap);
    cat1TotalsByYear.set(year, cat1Map);
    cat2TotalsByYear.set(year, cat2Map);
    lineTotalsByYear.set(year, lineMap);
  }

  // Sort function areas by current year total descending
  const fnCurrentTotals = fnTotalsByYear.get(currentYear) || new Map();
  const functionGroups = new Map<string, typeof current>();
  for (const row of current) {
    const fn = row.functionArea || "Other";
    if (!functionGroups.has(fn)) functionGroups.set(fn, []);
    functionGroups.get(fn)!.push(row);
  }
  const sortedFunctions = [...functionGroups.keys()].sort(
    (a, b) => (fnCurrentTotals.get(b) || 0) - (fnCurrentTotals.get(a) || 0)
  );

  const tableRows: TableRow[] = [];

  for (const fn of sortedFunctions) {
    const fnRows = functionGroups.get(fn)!;
    const fnKey = `fn:${fn}`;

    tableRows.push({
      id: `fn-${fn}`,
      groupKey: fnKey,
      cells: [fn, "", ...tableYears.map((y) => fnTotalsByYear.get(y)?.get(fn) || 0)],
      isGroup: true,
    });

    // Sort departments by current year total descending
    const deptGroups = new Map<string, typeof fnRows>();
    for (const row of fnRows) {
      const dept = row.department || "Other";
      if (!deptGroups.has(dept)) deptGroups.set(dept, []);
      deptGroups.get(dept)!.push(row);
    }
    const deptCurrentTotals = deptTotalsByYear.get(currentYear) || new Map();
    const sortedDepts = [...deptGroups.keys()].sort(
      (a, b) =>
        (deptCurrentTotals.get(`${fn}|${b}`) || 0) -
        (deptCurrentTotals.get(`${fn}|${a}`) || 0)
    );

    for (const dept of sortedDepts) {
      const deptRows = deptGroups.get(dept)!;
      const deptKey = `dept:${fn}|${dept}`;

      tableRows.push({
        id: `dept-${fn}-${dept}`,
        groupKey: deptKey,
        parentKey: fnKey,
        cells: [
          dept,
          "",
          ...tableYears.map((y) => deptTotalsByYear.get(y)?.get(`${fn}|${dept}`) || 0),
        ],
        isSubtotal: true,
        depth: 1,
      });

      // Check if any rows in this dept have category1
      const hasCats = deptRows.some((r) => r.category1);

      if (hasCats) {
        // Group by category1
        const cat1Groups = new Map<string, typeof deptRows>();
        for (const row of deptRows) {
          const cat1 = row.category1 || "(Uncategorized)";
          if (!cat1Groups.has(cat1)) cat1Groups.set(cat1, []);
          cat1Groups.get(cat1)!.push(row);
        }

        for (const [cat1, cat1Rows] of cat1Groups) {
          const cat1Key = `cat1:${fn}|${dept}|${cat1}`;

          tableRows.push({
            id: `cat1-${fn}-${dept}-${cat1}`,
            groupKey: cat1Key,
            parentKey: deptKey,
            cells: [
              cat1,
              "",
              ...tableYears.map(
                (y) => cat1TotalsByYear.get(y)?.get(`${fn}|${dept}|${cat1}`) || 0
              ),
            ],
            isSub2: true,
            depth: 2,
          });

          // Check for category2
          const hasCat2 = cat1Rows.some((r) => r.category2);
          if (hasCat2) {
            const cat2Groups = new Map<string, typeof cat1Rows>();
            for (const row of cat1Rows) {
              const cat2 = row.category2 || "(Other)";
              if (!cat2Groups.has(cat2)) cat2Groups.set(cat2, []);
              cat2Groups.get(cat2)!.push(row);
            }

            for (const [cat2, cat2Rows] of cat2Groups) {
              tableRows.push({
                id: `cat2-${fn}-${dept}-${cat1}-${cat2}`,
                parentKey: cat1Key,
                cells: [
                  cat2,
                  "",
                  ...tableYears.map(
                    (y) =>
                      cat2TotalsByYear.get(y)?.get(`${fn}|${dept}|${cat1}|${cat2}`) || 0
                  ),
                ],
                depth: 3,
              });

              for (const row of cat2Rows) {
                const lineKey = `${fn}|${dept}|${cat1}|${cat2}|${row.objectCode || ""}|${row.lineItem || ""}`;
                tableRows.push({
                  id: row.id,
                  parentKey: cat1Key,
                  cells: [
                    row.lineItem || row.objectCode || "",
                    row.objectCode || "",
                    ...tableYears.map((y) => lineTotalsByYear.get(y)?.get(lineKey) || 0),
                  ],
                  depth: 4,
                });
              }
            }
          } else {
            for (const row of cat1Rows) {
              const lineKey = `${fn}|${dept}|${cat1}||${row.objectCode || ""}|${row.lineItem || ""}`;
              tableRows.push({
                id: row.id,
                parentKey: cat1Key,
                cells: [
                  row.lineItem || row.objectCode || "",
                  row.objectCode || "",
                  ...tableYears.map((y) => lineTotalsByYear.get(y)?.get(lineKey) || 0),
                ],
                depth: 3,
              });
            }
          }
        }
      } else {
        // No categories — flat list under department
        for (const row of deptRows) {
          const lineKey = `${fn}|${dept}|||${row.objectCode || ""}|${row.lineItem || ""}`;
          tableRows.push({
            id: row.id,
            parentKey: deptKey,
            cells: [
              row.lineItem || row.objectCode || "",
              row.objectCode || "",
              ...tableYears.map((y) => lineTotalsByYear.get(y)?.get(lineKey) || 0),
            ],
            depth: 2,
          });
        }
      }
    }
  }

  const exportData = current.map((r) => {
    const lineKey = `${r.functionArea || "Other"}|${r.department || "Other"}|${r.category1 || ""}|${r.category2 || ""}|${r.objectCode || ""}|${r.lineItem || ""}`;
    const yearCols: Record<string, string> = {};
    for (const y of tableYears) {
      yearCols[`FY${y}`] = formatCurrency(lineTotalsByYear.get(y)?.get(lineKey) || 0);
    }
    return {
      "Function Area": r.functionArea || "",
      Department: r.department || "",
      Category: r.category1 || "",
      Subcategory: r.category2 || "",
      "Line Item": r.lineItem || "",
      Account: r.objectCode || "",
      ...yearCols,
    };
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-gray-600 mt-1">Departmental spending by function area</p>
        </div>
        <ExportButton
          data={exportData}
          filename={`${town.slug}-expenses-fy${currentYear}`}
        />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800 leading-relaxed">
          <strong>How to read this page:</strong> Function area headers (in color) show the
          biggest spending categories — click any header to collapse or expand it. Each
          department is listed below with its line items. Use the search box to find any
          account quickly.
        </p>
      </div>

      <SummaryTiles tiles={tiles} tooltips={categoryTooltips} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <PieChart
            data={byFunction}
            title={`FY${currentYear} by Function Area`}
            townColor={town.primaryColor}
          />
        </div>
        <div className="lg:col-span-3">
          <BarChart
            categories={years.map((y) => `FY${y}`)}
            series={trendSeries}
            title="Expense Trend by Function"
            stacked
          />
        </div>
      </div>

      <BudgetTable
        headers={["Description", "Account"]}
        rows={tableRows}
        categoryTooltips={categoryTooltips}
        lineItemTooltips={lineItemTooltips}
        yearColumns={{ years: tableYears }}
        townColor={town.primaryColor}
      />
    </div>
  );
}
