// app/api/public/summary/route.ts  (Next.js App Router)
//
// Only two things in here are guesses — everything else is built
// directly against your real schema.prisma:
//   1. The Town slug for Sutton (✎ EDIT below)
//   2. The exact string values you use for `dataCategory` and
//      `amountType` on BudgetRow (✎ EDIT below) — the schema defines
//      these as free-text strings, so only your seeding/import code
//      knows whether it's "expense"/"Expenses", "budget"/"Budget", etc.
//      Check an existing BudgetRow in your DB (or wherever you set
//      these during CSV import) and swap the values in CATEGORY below.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // ✎ EDIT if your Prisma client lives elsewhere

const TOWN_SLUG = 'sutton'; // ✎ EDIT: confirm this matches Town.slug in your DB

const CATEGORY = {
  expense: 'expense',   // ✎ EDIT: exact dataCategory value used for expense rows
  revenue: 'revenue',   // ✎ EDIT: exact dataCategory value used for revenue rows
  budgetAmount: 'budget', // ✎ EDIT: exact amountType value for budgeted (not actual) figures
};

export async function GET() {
  const town = await prisma.town.findUnique({
    where: { slug: TOWN_SLUG },
    select: { id: true },
  });

  if (!town) {
    return NextResponse.json({ error: 'Town not found' }, { status: 404 });
  }

  // Infer the current fiscal year as the most recent one present
  // in the expense data for this town.
  const latest = await prisma.budgetRow.findFirst({
    where: { townId: town.id, dataCategory: CATEGORY.expense },
    orderBy: { fiscalYear: 'desc' },
    select: { fiscalYear: true },
  });

  if (!latest) {
    return NextResponse.json({ error: 'No budget data found' }, { status: 404 });
  }

  const fiscalYear = latest.fiscalYear;

  const [expenseAgg, revenueAgg] = await Promise.all([
    prisma.budgetRow.aggregate({
      where: {
        townId: town.id,
        fiscalYear,
        dataCategory: CATEGORY.expense,
        amountType: CATEGORY.budgetAmount,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.budgetRow.aggregate({
      where: {
        townId: town.id,
        fiscalYear,
        dataCategory: CATEGORY.revenue,
        amountType: CATEGORY.budgetAmount,
      },
      _sum: { amount: true },
    }),
  ]);

  const payload = {
    fiscalYear,                                   // e.g. "FY2027"
    operatingBudget: expenseAgg._sum.amount ?? 0,  // e.g. 41871239
    totalRevenue: revenueAgg._sum.amount ?? 0,     // e.g. 42010413
    lineItems: expenseAgg._count._all,             // e.g. 629
  };

  return NextResponse.json(payload, {
    headers: {
      // Public budget data — safe for cross-origin reads from the
      // town's main CivicPlus site. Narrow this to that exact domain
      // instead of "*" if you'd rather be strict about it.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600', // numbers don't change hourly
    },
  });
}

// Some hosts (and strict browsers) send a CORS preflight before the
// actual GET. Handle it so the fetch doesn't get blocked.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}
