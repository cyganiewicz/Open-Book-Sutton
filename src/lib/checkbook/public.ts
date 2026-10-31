// Everything the PUBLIC site is allowed to read about vendor payments.
// Rules of the road for this file:
//   • every query is limited to status = "published"
//   • only explicit, safe columns are selected (never rawName, memoRaw, check numbers…)

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export interface CheckbookFilters {
  fiscalYear?: string;
  warrant?: string;
  functionArea?: string;
  department?: string;
  category?: string;
  vendorId?: string;
  q?: string;
  minAmount?: number;
  maxAmount?: number;
  sort?: "date" | "amount" | "vendor";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface PublicPayment {
  id: string;
  date: string | null;
  vendor: string;
  vendorId: string;
  memo: string | null;
  functionArea: string | null;
  department: string | null;
  category: string | null;
  warrant: string | null;
  fiscalYear: string;
  amount: number;
  type: string;
}

export interface RankedItem { id: string; label: string; total: number; count: number }

export interface CheckbookSearchResult {
  rows: PublicPayment[];
  total: number;       // number of matching payments
  sum: number;         // net dollars of matching payments
  vendorCount: number;
  topVendors: RankedItem[];
  byFunction: RankedItem[];
  byDepartment: RankedItem[];
  warrants: WarrantSummary[];
  page: number;
  pageSize: number;
}

export interface WarrantSummary {
  warrant: string;      // "27-3" or "" for direct/off-cycle
  fiscalYear: string;
  count: number;
  total: number;
  firstDate: string | null;
  lastDate: string | null;
}

export interface CheckbookOverview {
  fiscalYears: string[];
  latestFiscalYear: string | null;
  functionAreas: string[];
  departments: string[];
  categories: string[];
  dataThrough: string | null;
  totalPayments: number;
  excludedCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function buildWhere(townId: string, f: CheckbookFilters, opts: { ignoreWarrant?: boolean } = {}): Prisma.CheckbookPaymentWhereInput {
  const and: Prisma.CheckbookPaymentWhereInput[] = [];
  const where: Prisma.CheckbookPaymentWhereInput = { townId, status: "published" };
  if (f.fiscalYear) where.fiscalYear = f.fiscalYear;
  if (f.warrant && !opts.ignoreWarrant) where.warrant = f.warrant === "__none__" ? null : f.warrant;
  if (f.functionArea) where.functionArea = f.functionArea;
  if (f.department) where.department = f.department;
  if (f.category) where.category = f.category;
  if (f.vendorId) where.vendorId = f.vendorId;
  if (f.minAmount !== undefined && Number.isFinite(f.minAmount)) and.push({ amount: { gte: f.minAmount } });
  if (f.maxAmount !== undefined && Number.isFinite(f.maxAmount)) and.push({ amount: { lte: f.maxAmount } });
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { memo: { contains: q } },
        { department: { contains: q } },
        { category: { contains: q } },
        { vendor: { displayName: { contains: q } } },
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}

export async function getCheckbookOverview(townId: string): Promise<CheckbookOverview> {
  const base = { townId, status: "published" } as const;
  const [years, fns, depts, cats, latest, total, excluded] = await Promise.all([
    prisma.checkbookPayment.groupBy({ by: ["fiscalYear"], where: base }),
    prisma.checkbookPayment.groupBy({ by: ["functionArea"], where: base }),
    prisma.checkbookPayment.groupBy({ by: ["department"], where: base }),
    prisma.checkbookPayment.groupBy({ by: ["category"], where: base }),
    prisma.checkbookPayment.aggregate({ where: base, _max: { invoiceDate: true } }),
    prisma.checkbookPayment.count({ where: base }),
    prisma.checkbookPayment.count({ where: { townId, status: "excluded" } }),
  ]);
  const fiscalYears = years.map(y => y.fiscalYear).sort().reverse();
  return {
    fiscalYears,
    latestFiscalYear: fiscalYears[0] ?? null,
    functionAreas: fns.map(f => f.functionArea).filter((f): f is string => !!f).sort(),
    departments: depts.map(d => d.department).filter((d): d is string => !!d).sort(),
    categories: cats.map(c => c.category).filter((c): c is string => !!c).sort(),
    dataThrough: latest._max.invoiceDate ? latest._max.invoiceDate.toISOString() : null,
    totalPayments: total,
    excludedCount: excluded,
  };
}

export async function searchCheckbook(townId: string, f: CheckbookFilters): Promise<CheckbookSearchResult> {
  const where = buildWhere(townId, f);
  const pageSize = Math.min(Math.max(f.pageSize ?? 50, 1), 200);
  const page = Math.max(f.page ?? 1, 1);
  const dir = f.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.CheckbookPaymentOrderByWithRelationInput[] =
    f.sort === "amount" ? [{ amount: dir }, { id: "asc" }]
    : f.sort === "vendor" ? [{ vendor: { displayName: dir } }, { invoiceDate: "desc" }, { id: "asc" }]
    : [{ invoiceDate: dir }, { id: "asc" }];

  const [rows, agg, vendorGroups, fnGroups, deptGroups, warrantGroups] = await Promise.all([
    prisma.checkbookPayment.findMany({
      where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
      select: {
        id: true, invoiceDate: true, amount: true, memo: true, functionArea: true, department: true, category: true,
        warrant: true, fiscalYear: true, paymentType: true,
        vendor: { select: { id: true, displayName: true } },
      },
    }),
    prisma.checkbookPayment.aggregate({ where, _count: true, _sum: { amount: true } }),
    prisma.checkbookPayment.groupBy({ by: ["vendorId"], where, _count: true, _sum: { amount: true } }),
    prisma.checkbookPayment.groupBy({ by: ["functionArea"], where, _count: true, _sum: { amount: true } }),
    prisma.checkbookPayment.groupBy({ by: ["department"], where, _count: true, _sum: { amount: true } }),
    // warrant timeline ignores the warrant filter so you can always see the other cycles
    prisma.checkbookPayment.groupBy({
      by: ["fiscalYear", "warrant"], where: buildWhere(townId, f, { ignoreWarrant: true }),
      _count: true, _sum: { amount: true }, _min: { invoiceDate: true }, _max: { invoiceDate: true },
    }),
  ]);

  const topVendorGroups = [...vendorGroups]
    .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0)).slice(0, 12);
  const vendorNames = topVendorGroups.length
    ? await prisma.checkbookVendor.findMany({
        where: { townId, id: { in: topVendorGroups.map(v => v.vendorId) } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = new Map(vendorNames.map(v => [v.id, v.displayName]));

  return {
    rows: rows.map(r => ({
      id: r.id,
      date: r.invoiceDate ? r.invoiceDate.toISOString() : null,
      vendor: r.vendor.displayName,
      vendorId: r.vendor.id,
      memo: r.memo,
      functionArea: r.functionArea,
      department: r.department,
      category: r.category,
      warrant: r.warrant,
      fiscalYear: r.fiscalYear,
      amount: r.amount,
      type: r.paymentType,
    })),
    total: agg._count,
    sum: round2(agg._sum.amount ?? 0),
    vendorCount: vendorGroups.length,
    topVendors: topVendorGroups.map(v => ({
      id: v.vendorId, label: nameOf.get(v.vendorId) ?? "Vendor", total: round2(v._sum.amount ?? 0), count: v._count,
    })),
    byFunction: [...fnGroups]
      .filter(d => d.functionArea)
      .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0)).slice(0, 12)
      .map(d => ({ id: d.functionArea!, label: d.functionArea!, total: round2(d._sum.amount ?? 0), count: d._count })),
    byDepartment: [...deptGroups]
      .filter(d => d.department)
      .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0)).slice(0, 12)
      .map(d => ({ id: d.department!, label: d.department!, total: round2(d._sum.amount ?? 0), count: d._count })),
    warrants: warrantGroups
      .map(w => ({
        warrant: w.warrant ?? "", fiscalYear: w.fiscalYear, count: w._count, total: round2(w._sum.amount ?? 0),
        firstDate: w._min.invoiceDate ? w._min.invoiceDate.toISOString() : null,
        lastDate: w._max.invoiceDate ? w._max.invoiceDate.toISOString() : null,
      }))
      .sort((a, b) => a.fiscalYear.localeCompare(b.fiscalYear) || a.warrant.localeCompare(b.warrant, undefined, { numeric: true })),
    page, pageSize,
  };
}

// ── CSV export (same filters as the screen) ──────────────────────────────────

function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Neutralize spreadsheet formula injection from free-text fields
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportCheckbookCsv(townId: string, f: CheckbookFilters): Promise<string> {
  const rows = await prisma.checkbookPayment.findMany({
    where: buildWhere(townId, f),
    orderBy: [{ fiscalYear: "asc" }, { warrant: "asc" }, { invoiceDate: "asc" }, { id: "asc" }],
    take: 100000,
    select: {
      fiscalYear: true, warrant: true, invoiceDate: true, amount: true, memo: true, functionArea: true,
      department: true, category: true, paymentType: true, vendor: { select: { displayName: true } },
    },
  });
  const header = ["Fiscal Year", "Warrant", "Invoice Date", "Vendor", "Description", "Function", "Department", "Category", "Type", "Amount"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      `FY${r.fiscalYear}`, r.warrant, r.invoiceDate ? r.invoiceDate.toISOString().slice(0, 10) : null,
      r.vendor.displayName, r.memo, r.functionArea, r.department, r.category, r.paymentType, r.amount.toFixed(2),
    ].map(csvCell).join(","));
  }
  return lines.join("\r\n");
}

// ── Query-string parsing (shared by the page and the API) ────────────────────

export function parseFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): CheckbookFilters {
  const get = (k: string): string | undefined => {
    const v = params instanceof URLSearchParams ? params.get(k) ?? undefined : params[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const num = (k: string): number | undefined => {
    const v = get(k);
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const sort = get("sort");
  const fy = get("fy");
  return {
    fiscalYear: fy && fy !== "all" && /^\d{4}$/.test(fy) ? fy : undefined,
    warrant: get("warrant")?.slice(0, 40),
    functionArea: get("fn")?.slice(0, 120),
    department: get("dept")?.slice(0, 120),
    category: get("cat")?.slice(0, 120),
    vendorId: get("vendor")?.slice(0, 60),
    q: get("q")?.slice(0, 100),
    minAmount: num("min"),
    maxAmount: num("max"),
    sort: sort === "amount" || sort === "vendor" ? sort : "date",
    dir: get("dir") === "asc" ? "asc" : "desc",
    page: Math.min(Math.max(Math.floor(num("page") ?? 1), 1), 10000),
    pageSize: Math.min(Math.max(Math.floor(num("size") ?? 50), 1), 200),
  };
}
