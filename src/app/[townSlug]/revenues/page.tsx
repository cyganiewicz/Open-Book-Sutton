import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  groupAndSum,
  toChartData,
  buildRevenueSummaryTiles,
  detectCurrentAndPreviousYear,
} from "@/lib/aggregator";
import { formatCurrency } from "@/lib/format";
import SummaryTiles from "@/components/portal/SummaryTiles";
import PieChart from "@/components/portal/PieChart";
import BarChart from "@/components/portal/BarChart";
import ExportButton from "@/components/portal/ExportButton";

export default async function RevenuesPage({
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
    where: { townId: town.id, dataCategory: "revenues" },
  });

  const { currentYear, previousYear, allYears } = detectCurrentAndPreviousYear(allRows);

  const current = allRows.filter(
    (r) => r.fiscalYear === currentYear && r.amountType === "budget"
  );
  const prev = previousYear
    ? allRows.filter(
        (r) =>
          r.fiscalYear === previousYear &&
          (r.amountType === "actual" || r.amountType === "budget")
      )
    : [];

  const tiles = buildRevenueSummaryTiles(current, prev);
  const byCategory = toChartData(groupAndSum(current, "category1"));

  const years = allYears.length > 0 ? allYears : [currentYear];
  const categories: string[] = [...new Set(current.map((r) => r.category1 || "Other"))];
  const trendSeries = categories.slice(0, 8).map((cat) => ({
    label: cat,
    data: years.map((y) =>
      allRows
        .filter((r) => r.category1 === cat && r.fiscalYear === y)
        .reduce((s, r) => s + r.amount, 0)
    ),
  }));

  // Build grouped table data: cat1 → [cat2 →] line items
  const tableYears = allYears.length > 0 ? allYears : [currentYear];

  type RevLineItem = { id: string; label: string; amounts: Record<string, number> };
  type RevCat2 = { name: string; amounts: Record<string, number>; items: RevLineItem[] };
  type RevCat1 = { name: string; amounts: Record<string, number>; subCategories: RevCat2[]; items: RevLineItem[] };

  const cat1Totals = new Map<string, Map<string, number>>();
  const cat2Totals = new Map<string, Map<string, number>>();
  const lineTotals = new Map<string, Map<string, number>>();

  for (const year of tableYears) {
    const yr = allRows.filter(
      (r) =>
        r.fiscalYear === year &&
        (year === currentYear ? r.amountType === "budget" : r.amountType === "budget" || r.amountType === "actual")
    );
    const c1 = new Map<string, number>();
    const c2 = new Map<string, number>();
    const lm = new Map<string, number>();
    for (const row of yr) {
      const cat1 = row.category1 || "Other";
      const cat2 = row.category2 || "";
      const lk = `${cat1}|${cat2}|${row.lineItem || ""}`;
      c1.set(cat1, (c1.get(cat1) || 0) + row.amount);
      if (cat2) c2.set(`${cat1}|${cat2}`, (c2.get(`${cat1}|${cat2}`) || 0) + row.amount);
      lm.set(lk, (lm.get(lk) || 0) + row.amount);
    }
    cat1Totals.set(year, c1);
    cat2Totals.set(year, c2);
    lineTotals.set(year, lm);
  }

  const catGroups = new Map<string, typeof current>();
  for (const row of current) {
    const cat = row.category1 || "Other";
    if (!catGroups.has(cat)) catGroups.set(cat, []);
    catGroups.get(cat)!.push(row);
  }

  const totalCurrent = current.reduce((s, r) => s + r.amount, 0);

  const revenueData: RevCat1[] = [...catGroups.entries()]
    .sort(
      (a, b) =>
        (cat1Totals.get(currentYear)?.get(b[0]) || 0) -
        (cat1Totals.get(currentYear)?.get(a[0]) || 0)
    )
    .map(([cat1, rows]) => {
      const hasCat2 = rows.some((r) => r.category2);
      const getAmts = (lk: string, map: Map<string, Map<string, number>>) => {
        const a: Record<string, number> = {};
        for (const y of tableYears) a[y] = map.get(y)?.get(lk) || 0;
        return a;
      };

      if (!hasCat2) {
        return {
          name: cat1,
          amounts: getAmts(cat1, cat1Totals),
          subCategories: [],
          items: rows.map((row) => ({
            id: row.id,
            label: row.lineItem || row.category2 || "",
            amounts: getAmts(`${cat1}||${row.lineItem || ""}`, lineTotals),
          })),
        };
      }

      const cat2Groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const c2 = row.category2 || "(Other)";
        if (!cat2Groups.has(c2)) cat2Groups.set(c2, []);
        cat2Groups.get(c2)!.push(row);
      }

      return {
        name: cat1,
        amounts: getAmts(cat1, cat1Totals),
        subCategories: [...cat2Groups.entries()].map(([cat2, c2rows]) => ({
          name: cat2,
          amounts: getAmts(`${cat1}|${cat2}`, cat2Totals),
          items: c2rows.map((row) => ({
            id: row.id,
            label: row.lineItem || "",
            amounts: getAmts(`${cat1}|${cat2}|${row.lineItem || ""}`, lineTotals),
          })),
        })),
        items: [],
      };
    });

  const exportData = current.map((r) => {
    const lk = `${r.category1 || "Other"}|${r.category2 || ""}|${r.lineItem || ""}`;
    const yearCols: Record<string, string> = {};
    for (const y of tableYears) yearCols[`FY${y}`] = formatCurrency(lineTotals.get(y)?.get(lk) || 0);
    return { Category: r.category1 || "", Subcategory: r.category2 || "", Description: r.lineItem || "", ...yearCols };
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

      <SummaryTiles tiles={tiles} tooltips={categoryTooltips} townColor={town.primaryColor} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChart data={byCategory} title={`FY${currentYear} Revenue by Category`} townColor={town.primaryColor} />
        <BarChart categories={years.map((y) => `FY${y}`)} series={trendSeries} title="Revenue Trend by Category" stacked />
      </div>

      {/* Revenue table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
          <p className="text-sm font-medium text-gray-700">Revenue Detail</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: "480px" }}>
            <thead>
              <tr className="border-b-2 border-gray-200 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Source</th>
                {tableYears.map((y) => (
                  <th key={y} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap w-36"
                    style={{ color: y === currentYear ? town.primaryColor : "#9ca3af" }}>
                    FY{y}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400 w-20">%</th>
              </tr>
            </thead>
            <tbody>
              {revenueData.map((cat1) => {
                const pct = totalCurrent > 0 ? ((cat1.amounts[currentYear] || 0) / totalCurrent * 100).toFixed(1) : "0";
                return (
                  <tbody key={cat1.name}>
                    <tr className="border-t border-gray-100" style={{ backgroundColor: `rgba(${hexRgb(town.primaryColor)},0.06)` }}>
                      <td className="px-5 py-2.5 font-semibold text-gray-800">{cat1.name}</td>
                      {tableYears.map((y) => (
                        <td key={y} className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-700">{formatCurrency(cat1.amounts[y] || 0)}</td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 font-medium">{pct}%</td>
                    </tr>
                    {/* Direct items */}
                    {cat1.items.map((item) => (
                      <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                        <td className="px-5 py-2 text-gray-600" style={{ paddingLeft: "2.75rem" }}>{item.label}</td>
                        {tableYears.map((y) => (
                          <td key={y} className={`px-4 py-2 text-right tabular-nums ${(item.amounts[y] || 0) === 0 ? "text-gray-300" : "text-gray-700"}`}>
                            {(item.amounts[y] || 0) === 0 ? "—" : formatCurrency(item.amounts[y])}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right text-gray-300">—</td>
                      </tr>
                    ))}
                    {/* Subcategories */}
                    {cat1.subCategories.map((cat2) => (
                      <tbody key={cat2.name}>
                        <tr className="border-t border-gray-100 bg-gray-50/30">
                          <td className="px-5 py-2 font-medium text-gray-700" style={{ paddingLeft: "2.75rem" }}>{cat2.name}</td>
                          {tableYears.map((y) => (
                            <td key={y} className="px-4 py-2 text-right tabular-nums font-medium text-gray-600">{formatCurrency(cat2.amounts[y] || 0)}</td>
                          ))}
                          <td className="px-4 py-2 text-right text-gray-300">—</td>
                        </tr>
                        {cat2.items.map((item) => (
                          <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                            <td className="px-5 py-2 text-gray-500 text-xs" style={{ paddingLeft: "4rem" }}>{item.label}</td>
                            {tableYears.map((y) => (
                              <td key={y} className={`px-4 py-2 text-right tabular-nums text-xs ${(item.amounts[y] || 0) === 0 ? "text-gray-300" : "text-gray-600"}`}>
                                {(item.amounts[y] || 0) === 0 ? "—" : formatCurrency(item.amounts[y])}
                              </td>
                            ))}
                            <td className="px-4 py-2 text-right text-gray-300">—</td>
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </tbody>
                );
              })}
              <tr className="border-t-2 border-gray-300 bg-gray-50/80">
                <td className="px-5 py-3 font-bold text-gray-900">Total Revenue</td>
                {tableYears.map((y) => (
                  <td key={y} className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                    {formatCurrency(revenueData.reduce((s, c) => s + (c.amounts[y] || 0), 0))}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-bold text-gray-900">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function hexRgb(hex: string): string {
  const r = parseInt((hex || "#1e40af").slice(1, 3), 16);
  const g = parseInt((hex || "#1e40af").slice(3, 5), 16);
  const b = parseInt((hex || "#1e40af").slice(5, 7), 16);
  return `${r},${g},${b}`;
}
