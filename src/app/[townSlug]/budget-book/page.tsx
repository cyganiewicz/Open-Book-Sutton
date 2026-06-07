import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { groupAndSum, detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { formatCurrency, abbreviateCurrency } from "@/lib/format";
import {
  parseAccountCodeConfig,
  DEFAULT_EXPENSE_LEVELS,
  DEFAULT_REVENUE_LEVELS,
} from "@/lib/account-codes";
import { applySortOrder } from "@/lib/portal-sort";
import { buildHierarchyV2, type HierarchyNode } from "@/app/[townSlug]/expenses/page";
import PrintButton from "@/components/portal/PrintButton";

export default async function BudgetBookPage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town || !town.published) return notFound();

  // Load portal organization settings
  const acConfig = parseAccountCodeConfig(town.accountCodeRules || "");
  const expLevels = acConfig?.portalOrganization?.expenseLevels ?? DEFAULT_EXPENSE_LEVELS;
  const revLevels = acConfig?.portalOrganization?.revenueLevels ?? DEFAULT_REVENUE_LEVELS;
  const fnSort   = expLevels[0]?.sort ?? "total_desc";
  const deptSort = expLevels[1]?.sort ?? "total_desc";
  const catSort  = expLevels[2]?.sort ?? "total_desc";
  const revCatSort = revLevels[0]?.sort ?? "total_desc";
  const revSubSort = revLevels[1]?.sort ?? "total_desc";

  const allExpenses = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "expenses" },
  });

  const allRevenues = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "revenues" },
  });

  const allCapital = await prisma.budgetRow.findMany({
    where: { townId: town.id, dataCategory: "capital" },
    orderBy: [{ department: "asc" }, { purpose: "asc" }],
  });

  const expYears = detectCurrentAndPreviousYear(allExpenses);
  const revYears = detectCurrentAndPreviousYear(allRevenues);
  const currentYear = expYears.currentYear || revYears.currentYear || "2026";

  const currentExpenses = allExpenses.filter(
    (r) => r.fiscalYear === currentYear && r.amountType === "budget"
  );
  const currentRevenues = allRevenues.filter(
    (r) => r.fiscalYear === revYears.currentYear && r.amountType === "budget"
  );
  const currentCapital = allCapital.filter(
    (r) => r.fiscalYear === currentYear
  );

  const totalExpenses = currentExpenses.reduce((s, r) => s + r.amount, 0);
  const totalRevenues = currentRevenues.reduce((s, r) => s + r.amount, 0);
  const totalCapital = currentCapital.reduce((s, r) => s + r.amount, 0);

  const expensesByFunction = groupAndSum(currentExpenses, "functionArea");
  const revenuesByCategory = groupAndSum(currentRevenues, "category1");
  const capitalByDept = groupAndSum(currentCapital, "department");

  // Build dynamic expense hierarchy using portal organization settings
  const expHierarchy = buildHierarchyV2(
    currentExpenses as Parameters<typeof buildHierarchyV2>[0],
    allExpenses as Parameters<typeof buildHierarchyV2>[1],
    expLevels.length > 1 ? expLevels.slice(0, -1) : expLevels,
    0,
    [currentYear],
    currentYear,
    () => true
  );

  const revCatGroups = new Map<string, typeof currentRevenues>();
  for (const row of currentRevenues) {
    const cat = row.category1 || "Other";
    if (!revCatGroups.has(cat)) revCatGroups.set(cat, []);
    revCatGroups.get(cat)!.push(row);
  }

  // Recursive renderer for budget book (print-optimized, no collapse)
  function renderHierarchy(nodes: HierarchyNode[], depth: number): React.ReactNode {
    return nodes.map(node => (
      <div key={node.key} className={depth === 0 ? "mb-8" : depth === 1 ? "mb-4 ml-4" : "ml-8 mb-2"}>
        {depth === 0 && (
          <h3 className="text-lg font-semibold mt-6 mb-2" style={{ color: town.primaryColor }}>
            {node.key} — {formatCurrency(node.amounts[currentYear] || 0)}
          </h3>
        )}
        {depth === 1 && (
          <h4 className="text-sm font-semibold text-gray-700 mb-1">
            {node.key} — {formatCurrency(node.amounts[currentYear] || 0)}
          </h4>
        )}
        {depth >= 2 && !node.isLeaf && (
          <p className="text-xs font-semibold text-gray-600 mb-1 mt-2">{node.key} — {formatCurrency(node.amounts[currentYear] || 0)}</p>
        )}
        {node.isLeaf && node.rows && node.rows.length > 0 ? (
          <table className="w-full text-xs">
            <tbody>
              {node.rows.map(row => (
                <tr key={row.id} className="border-b border-gray-50">
                  <td className="py-1 text-gray-600">{row.label || "—"}</td>
                  <td className="py-1 text-right tabular-nums w-32">{formatCurrency(row.amounts[currentYear] || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : !node.isLeaf ? (
          renderHierarchy(node.children, depth + 1)
        ) : null}
      </div>
    ));
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="no-print bg-gray-50 border-b border-gray-200 py-4 px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">
              {town.name} Budget Book
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              This is a printable version of the full budget.
            </p>
          </div>
          <PrintButton />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-12">
        {/* Cover */}
        <div className="text-center mb-16">
          {town.logoUrl && (
            <img
              src={town.logoUrl}
              alt={`${town.name} logo`}
              className="h-24 w-24 mx-auto mb-6 object-contain"
            />
          )}
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: town.primaryColor }}>
            Town of {town.name}
          </h1>
          <p className="text-xl text-gray-600 mt-2">
            FY{currentYear} Budget Book
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Generated {new Date().toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })}
          </p>
        </div>

        {/* Executive Summary */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 pb-2 border-b-2" style={{ borderColor: town.primaryColor }}>
            Executive Summary
          </h2>
          <div className="grid grid-cols-3 gap-6 mt-6">
            <div className="text-center p-4 rounded-xl text-white" style={{ backgroundColor: town.primaryColor }}>
              <p className="text-sm text-white/70">Total Expenses</p>
              <p className="text-2xl font-bold mt-1">{abbreviateCurrency(totalExpenses)}</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{abbreviateCurrency(totalRevenues)}</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-sm text-gray-500">Capital Projects</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{abbreviateCurrency(totalCapital)}</p>
            </div>
          </div>
        </section>

        {/* Expenses by Function */}
        <section className="mb-12 page-break">
          <h2 className="text-2xl font-semibold mb-4 pb-2 border-b-2" style={{ borderColor: town.primaryColor }}>
            Expenses Summary by Function
          </h2>
          <table className="w-full text-sm mt-4">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th scope="col" className="text-left py-2 font-semibold">Function Area</th>
                <th scope="col" className="text-right py-2 font-semibold">FY{currentYear} Budget</th>
                <th scope="col" className="text-right py-2 font-semibold">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(expensesByFunction)
                .sort((a, b) => {
                  switch (fnSort) {
                    case "alpha_asc":  return a[0].localeCompare(b[0]);
                    case "alpha_desc": return b[0].localeCompare(a[0]);
                    case "total_asc":  return a[1] - b[1];
                    default:           return b[1] - a[1];
                  }
                })
                .map(([fn, amount]) => (
                  <tr key={fn} className="border-b border-gray-100">
                    <td className="py-2">{fn}</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrency(amount)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              <tr className="border-t-2 border-gray-300 font-bold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(totalExpenses)}</td>
                <td className="py-2 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Detailed Expenses */}
        <section className="mb-12 page-break">
          <h2 className="text-2xl font-semibold mb-4 pb-2 border-b-2" style={{ borderColor: town.primaryColor }}>
            Detailed Expense Budget
          </h2>
          {renderHierarchy(expHierarchy, 0)}
        </section>

        {/* Revenue Summary */}
        <section className="mb-12 page-break">
          <h2 className="text-2xl font-semibold mb-4 pb-2 border-b-2" style={{ borderColor: town.primaryColor }}>
            Revenue Summary
          </h2>
          <table className="w-full text-sm mt-4">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th scope="col" className="text-left py-2 font-semibold">Category</th>
                <th scope="col" className="text-right py-2 font-semibold">FY{revYears.currentYear} Budget</th>
                <th scope="col" className="text-right py-2 font-semibold">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(revenuesByCategory)
                .sort((a, b) => {
                  switch (revCatSort) {
                    case "alpha_asc":  return a[0].localeCompare(b[0]);
                    case "alpha_desc": return b[0].localeCompare(a[0]);
                    case "total_asc":  return a[1] - b[1];
                    default:           return b[1] - a[1];
                  }
                })
                .map(([cat, amount]) => (
                  <tr key={cat} className="border-b border-gray-100">
                    <td className="py-2">{cat}</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrency(amount)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {totalRevenues > 0 ? ((amount / totalRevenues) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              <tr className="border-t-2 border-gray-300 font-bold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(totalRevenues)}</td>
                <td className="py-2 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Detailed Revenues */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 pb-2 border-b-2" style={{ borderColor: town.primaryColor }}>
            Detailed Revenue Budget
          </h2>
          {applySortOrder(
              [...revCatGroups.entries()],
              revCatSort,
              ([cat]) => cat,
              ([, rows]) => rows.reduce((s, r) => s + r.amount, 0)
            ).map(([cat, rows]) => {
            const catTotal = rows.reduce((s, r) => s + r.amount, 0);
            return (
              <div key={cat} className="mb-6">
                <h3 className="text-lg font-semibold mt-4 mb-2" style={{ color: town.primaryColor }}>
                  {cat} — {formatCurrency(catTotal)}
                </h3>
                <table className="w-full text-xs ml-4">
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-gray-50">
                        <td className="py-1 text-gray-600">
                          {row.lineItem || row.category2 || "—"}
                        </td>
                        <td className="py-1 text-right tabular-nums w-32">
                          {formatCurrency(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        {/* Capital Projects */}
        {currentCapital.length > 0 && (
          <section className="mb-12 page-break">
            <h2 className="text-2xl font-semibold mb-4 pb-2 border-b-2" style={{ borderColor: town.primaryColor }}>
              Capital Projects — FY{currentYear}
            </h2>
            <table className="w-full text-sm mt-4">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th scope="col" className="text-left py-2 font-semibold">Department</th>
                  <th scope="col" className="text-left py-2 font-semibold">Purpose</th>
                  <th scope="col" className="text-right py-2 font-semibold">Amount</th>
                  <th scope="col" className="text-left py-2 font-semibold">Funding Source</th>
                </tr>
              </thead>
              <tbody>
                {currentCapital.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-2 font-medium">{row.department || "Other"}</td>
                    <td className="py-2">{row.purpose || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrency(row.amount)}</td>
                    <td className="py-2">{row.fundingSource || "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 font-bold">
                  <td className="py-2" colSpan={2}>Total Capital</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(totalCapital)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-gray-500 mt-16 pt-8 border-t border-gray-200">
          <p>Town of {town.name} — FY{currentYear} Budget Book</p>
          <p className="mt-1">Generated by OpenBook</p>
          {town.contactEmail && (
            <p className="mt-1">Contact: {town.contactEmail}</p>
          )}
        </footer>
      </div>
    </div>
  );
}
