export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { detectCurrentAndPreviousYear } from "@/lib/aggregator";
import { abbreviateCurrency, formatCurrency } from "@/lib/format";
import { parseAccountCodeConfig, resolveRevenueCategory, applyAccountCodeConfig } from "@/lib/account-codes";
import { fallbackSpendingType } from "@/lib/expense-types";
import HomepageClient from "@/components/portal/HomepageClient";
import { parseSiteText } from "@/lib/site-text";

export default async function TownHomePage({
  params,
}: {
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });
  if (!town) return notFound();

  const acConfig = parseAccountCodeConfig(town.accountCodeRules || "");
  const color = town.primaryColor || "#1B3A2D";

  const [expenseRows, revenueRows, capitalRows] = await Promise.all([
    prisma.budgetRow.findMany({ where: { townId: town.id, dataCategory: "expenses" } }),
    prisma.budgetRow.findMany({ where: { townId: town.id, dataCategory: "revenues" } }),
    prisma.budgetRow.findMany({ where: { townId: town.id, dataCategory: "capital" }, orderBy: [{ fiscalYear: "desc" }, { amount: "desc" }] }),
  ]);

  const capitalYears = [...new Set(capitalRows.map(r => r.fiscalYear))].sort().reverse();
  const latestCapYear = capitalYears[0] || "";
  const latestCapRows = capitalRows.filter(r => r.fiscalYear === latestCapYear);
  const totalCapital = latestCapRows.reduce((s, r) => s + r.amount, 0);

  const { currentYear: expYear } = detectCurrentAndPreviousYear(expenseRows);
  const siteText = parseSiteText((town as {siteText?: string}).siteText || "", town.name, expYear);
  const { currentYear: revYear } = detectCurrentAndPreviousYear(revenueRows);

  const currentExpenses = expenseRows
    .filter(r => r.fiscalYear === expYear && r.amountType === "budget")
    .map(r => {
      if (!acConfig) return r;
      const d = applyAccountCodeConfig(r.objectCode, r.department, acConfig);
      return { ...r, functionArea: d.functionArea || r.functionArea, category1: d.category1 || r.category1 };
    });

  const currentRevenues = revenueRows
    .filter(r => r.fiscalYear === revYear && r.amountType === "budget")
    .map(r => {
      if (!acConfig?.revenueConfig) return r;
      const d = resolveRevenueCategory(r.objectCode, acConfig.revenueConfig);
      return { ...r, category1: d.category1 || r.category1 };
    });

  const totalExpenses = currentExpenses.reduce((s, r) => s + r.amount, 0);
  const totalRevenues = currentRevenues.reduce((s, r) => s + r.amount, 0);

  const expByFn: Record<string, number> = {};
  for (const r of currentExpenses) expByFn[r.functionArea || "Other"] = (expByFn[r.functionArea || "Other"] || 0) + r.amount;
  const topFunctions = Object.entries(expByFn).sort((a, b) => b[1] - a[1]);

  const revByCat: Record<string, number> = {};
  for (const r of currentRevenues) revByCat[r.category1 || "Other"] = (revByCat[r.category1 || "Other"] || 0) + r.amount;
  const topRevenues = Object.entries(revByCat).sort((a, b) => b[1] - a[1]);

  const hasData = totalExpenses > 0;
  const balance = totalRevenues - totalExpenses;

  // Capital by dept for spotlight
  const capByDept: Record<string, number> = {};
  for (const r of latestCapRows) capByDept[r.department || "Other"] = (capByDept[r.department || "Other"] || 0) + r.amount;
  const topCapDepts = Object.entries(capByDept).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <HomepageClient
      town={{
        name: town.name,
        slug: town.slug,
        primaryColor: color,
        logoUrl: town.logoUrl,
        heroImageUrl: town.heroImageUrl,
        aboutText: town.aboutText,
        contactEmail: town.contactEmail,
      }}
      siteText={siteText}
      data={{
        hasData,
        expYear,
        revYear,
        latestCapYear,
        totalExpenses,
        totalRevenues,
        totalCapital,
        balance,
        topFunctions,
        topRevenues,
        topCapDepts,
        lineItemCount: currentExpenses.length,
      }}
    />
  );
}
