// Database layer for uploading an ERP extract: analyze → (optionally) commit.
// "preview" and "commit" run the exact same analysis so what you approve is
// exactly what gets written.

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { parseErpExtract, assignKeys, normalizeInvoice } from "./parse";
import {
  planExtract, findPossibleDuplicates, HOLD_REASON_LABEL,
  type ExistingPayment, type RegistryVendor, type PaymentStatus, type VendorKind,
  type DupCandidate, type VendorSlot, type PlanRow, type HoldReason,
} from "./plan";
import { parseSettings } from "./settings";
import { smartCase } from "./pii";
import { parseAccountCodeConfig, applyAccountCodeConfig, type AccountCodeConfig } from "@/lib/account-codes";

/**
 * Function area / department / category as shown publicly. Uses the same
 * account-code mapping as the Expenses page when the town has one set up;
 * otherwise falls back to the ERP's own cost-center text, tidied for reading.
 */
function orgFields(
  r: { glAccount: string | null; department: string | null; category: string | null },
  config: AccountCodeConfig | null
) {
  const derived = config && r.glAccount ? applyAccountCodeConfig(r.glAccount, r.department, config) : null;
  const dept = derived?.department || (r.department ? smartCase(r.department) : null);
  return {
    functionArea: derived?.functionArea || null,
    department: dept,
    category: r.category ? smartCase(r.category) : null,
  };
}

const CHUNK = 400;
function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface UploadReport {
  mode: "preview" | "commit";
  fileName: string;
  fileHash: string;
  batchId: string | null;
  alreadyUploaded: { fileName: string; createdAt: string } | null;
  totalRows: number;
  skipped: { unpaid: number; zeroAmount: number; invalid: { row: number; reason: string }[] };
  counts: {
    new: number; duplicate: number; changed: number;
    published: number; held: number; excluded: number; flagged: number;
  };
  newAmount: number;
  holdReasons: { reason: string; label: string; count: number }[];
  newVendors: { total: number; autoApproved: number; needReview: number };
  fiscalYears: string[];
  warrants: { warrant: string; fiscalYear: string; rows: number; newRows: number; amount: number }[];
  changed: { vendor: string; warrant: string | null; amount: number; note: string }[];
  possibleDuplicates: { vendor: string; amount: number; warrant: string | null; invoice: string | null; note: string }[];
}

export class UploadError extends Error {}

export async function processExtract(opts: {
  townId: string;
  fileName: string;
  buffer: Buffer;
  mode: "preview" | "commit";
  uploadedBy?: string | null;
}): Promise<UploadReport> {
  const { townId, fileName, buffer, mode } = opts;

  let parsed;
  try {
    parsed = parseErpExtract(buffer, fileName);
  } catch (e) {
    throw new UploadError(e instanceof Error ? e.message : "Could not read the file.");
  }
  if (parsed.records.length === 0) {
    throw new UploadError("No paid payment rows were found in this file.");
  }

  const town = await prisma.town.findUnique({
    where: { id: townId }, select: { checkbookSettings: true, accountCodeRules: true },
  });
  if (!town) throw new UploadError("Town not found.");
  const settings = parseSettings(town.checkbookSettings);
  const acConfig = parseAccountCodeConfig(town.accountCodeRules || "");

  const keyed = assignKeys(parsed.records);

  // ── What do we already have? ───────────────────────────────────────────────
  const existing = new Map<string, ExistingPayment>();
  for (const part of chunks(keyed.map(k => k.naturalKey))) {
    const rows = await prisma.checkbookPayment.findMany({
      where: { townId, naturalKey: { in: part } },
      select: {
        id: true, naturalKey: true, contentHash: true, status: true, reviewed: true,
        vendorId: true, memo: true, erpVendorId: true,
        raw: { select: { memoRaw: true } },
      },
    });
    for (const r of rows) {
      existing.set(r.naturalKey, {
        id: r.id, naturalKey: r.naturalKey, contentHash: r.contentHash,
        status: r.status as PaymentStatus, reviewed: r.reviewed, vendorId: r.vendorId,
        memo: r.memo, memoRaw: r.raw?.memoRaw ?? null, erpVendorId: r.erpVendorId,
      });
    }
  }

  const registry = new Map<string, RegistryVendor>();
  const erpIds = [...new Set(keyed.map(k => k.erpVendorId))];
  for (const part of chunks(erpIds)) {
    const vs = await prisma.checkbookVendor.findMany({
      where: { townId, erpVendorId: { in: part } },
      select: { id: true, erpVendorId: true, rawName: true, displayName: true, kind: true },
    });
    for (const v of vs) registry.set(v.erpVendorId, { ...v, kind: v.kind as VendorKind });
  }

  // ── Decide ─────────────────────────────────────────────────────────────────
  const plan = planExtract(keyed, { settings, registry, existing });
  const fresh = plan.rows.filter(r => r.state !== "duplicate");

  // ── "Did we pay this twice?" check against what's already stored ───────────
  const invoiceKeys = [...new Set(fresh.map(r => normalizeInvoice(r.record.invoiceNo)).filter(s => s.length >= 4))];
  const dbCandidates: DupCandidate[] = [];
  for (const part of chunks(invoiceKeys)) {
    const rows = await prisma.checkbookPayment.findMany({
      where: { townId, invoiceNo: { in: part } },
      select: {
        naturalKey: true, erpVendorId: true, invoiceNo: true, amount: true, warrant: true,
        raw: { select: { document: true, voucher: true } },
      },
    });
    for (const r of rows) {
      dbCandidates.push({
        naturalKey: r.naturalKey, erpVendorId: r.erpVendorId, invoiceNorm: r.invoiceNo ?? "",
        amount: r.amount, document: r.raw?.document ?? "", voucher: r.raw?.voucher ?? null, warrant: r.warrant,
      });
    }
  }
  const dupNotes = findPossibleDuplicates(fresh.map(r => r.record), dbCandidates);

  // ── Report ─────────────────────────────────────────────────────────────────
  const prior = await prisma.checkbookBatch.findFirst({
    where: { townId, fileHash: parsed.fileHash },
    orderBy: { createdAt: "desc" },
    select: { fileName: true, createdAt: true },
  });

  const counts = { new: 0, duplicate: 0, changed: 0, published: 0, held: 0, excluded: 0, flagged: dupNotes.size };
  const holdTally = new Map<HoldReason, number>();
  const warrantMap = new Map<string, { warrant: string; fiscalYear: string; rows: number; newRows: number; amount: number }>();
  const changedList: UploadReport["changed"] = [];
  let newAmount = 0;

  for (const row of plan.rows) {
    const r = row.record;
    const wKey = `${r.fiscalYear}|${r.warrant ?? "—"}`;
    const w = warrantMap.get(wKey) ?? { warrant: r.warrant ?? "No warrant (direct pay)", fiscalYear: r.fiscalYear, rows: 0, newRows: 0, amount: 0 };
    w.rows++; w.amount += r.amount;
    if (row.state === "new") w.newRows++;
    warrantMap.set(wKey, w);

    if (row.state === "duplicate") { counts.duplicate++; continue; }
    if (row.state === "new") { counts.new++; newAmount += r.amount; } else {
      counts.changed++;
      changedList.push({
        vendor: r.vendorName, warrant: r.warrant, amount: r.amount,
        note: "Same document/voucher/account as an existing line, but details differ (amount, warrant, memo, etc.). It will be updated.",
      });
    }
    const d = row.decision!;
    if (d.status === "published") counts.published++;
    else if (d.status === "held") { counts.held++; holdTally.set(d.holdReason!, (holdTally.get(d.holdReason!) ?? 0) + 1); }
    else counts.excluded++;
  }

  const slots = [...plan.newVendors.values()];
  const report: UploadReport = {
    mode,
    fileName,
    fileHash: parsed.fileHash,
    batchId: null,
    alreadyUploaded: prior ? { fileName: prior.fileName, createdAt: prior.createdAt.toISOString() } : null,
    totalRows: parsed.totalRows,
    skipped: parsed.skipped,
    counts,
    newAmount: Math.round(newAmount * 100) / 100,
    holdReasons: [...holdTally].map(([reason, count]) => ({ reason, label: HOLD_REASON_LABEL[reason], count }))
      .sort((a, b) => b.count - a.count),
    newVendors: {
      total: slots.length,
      autoApproved: slots.filter(s => s.kind === "business").length,
      needReview: slots.filter(s => s.kind === "review").length,
    },
    fiscalYears: [...new Set(parsed.records.map(r => r.fiscalYear))].sort(),
    warrants: [...warrantMap.values()].sort((a, b) =>
      a.fiscalYear.localeCompare(b.fiscalYear) || a.warrant.localeCompare(b.warrant, undefined, { numeric: true })),
    changed: changedList.slice(0, 25),
    possibleDuplicates: [...dupNotes].slice(0, 25).map(([key, notes]) => {
      const r = keyed.find(k => k.naturalKey === key)!;
      return { vendor: r.vendorName, amount: r.amount, warrant: r.warrant, invoice: r.invoiceNo, note: notes[0] };
    }),
  };

  if (mode === "preview" || (counts.new === 0 && counts.changed === 0)) return report;

  // ── Commit ─────────────────────────────────────────────────────────────────
  const batchId = randomUUID();
  const vendorIds = await resolveVendorIds(townId, fresh, plan.newVendors);

  const paymentRows = fresh.filter(r => r.state === "new");
  const changedRows = fresh.filter(r => r.state === "changed");

  await prisma.$transaction(async tx => {
    // New vendor registry entries
    const toCreate = [...vendorIds.created.values()];
    for (const part of chunks(toCreate)) {
      await tx.checkbookVendor.createMany({
        data: part.map(v => ({
          id: v.id, townId, erpVendorId: v.slot.erpVendorId, rawName: v.slot.rawName,
          displayName: v.slot.displayName, kind: v.slot.kind, suggestedKind: v.slot.suggestedKind,
          decidedBy: v.slot.kind === "business" || v.slot.placeholder ? "system" : null,
          decidedAt: v.slot.kind === "business" || v.slot.placeholder ? new Date() : null,
        })),
      });
    }

    await tx.checkbookBatch.create({
      data: {
        id: batchId, townId, fileName, fileHash: parsed.fileHash, uploadedBy: opts.uploadedBy ?? null,
        rowCount: parsed.totalRows, newCount: counts.new, duplicateCount: counts.duplicate,
        changedCount: counts.changed,
        heldCount: counts.held, excludedCount: counts.excluded, flaggedCount: counts.flagged,
        totalAmount: report.newAmount,
        summary: JSON.stringify({ warrants: report.warrants, fiscalYears: report.fiscalYears, holdReasons: report.holdReasons }),
      },
    });

    for (const part of chunks(paymentRows, 150)) {
      const payments = part.map(row => buildPaymentData(row, townId, batchId, vendorIds, dupNotes, acConfig));
      await tx.checkbookPayment.createMany({ data: payments.map(p => p.payment) });
      const raws = payments.filter(p => p.raw).map(p => p.raw!);
      if (raws.length) await tx.checkbookPaymentRaw.createMany({ data: raws });
    }

    for (const row of changedRows) {
      const ex = row.existing!;
      const r = row.record;
      const d = row.decision!;
      const vendorId = d.vendor.existingId ?? vendorIds.created.get(d.vendor.erpVendorId)?.id ?? ex.vendorId;
      const keepReview = ex.reviewed && (ex.memoRaw ?? null) === (r.memo ?? null) && ex.vendorId === vendorId;
      await tx.checkbookPayment.update({
        where: { id: ex.id },
        data: {
          vendorId, erpVendorId: d.status === "excluded" ? "__excluded__" : r.erpVendorId,
          contentHash: r.contentHash, fiscalYear: r.fiscalYear, period: r.period, warrant: r.warrant,
          paymentType: r.type, amount: r.amount, invoiceDate: r.invoiceDate,
          invoiceNo: normalizeInvoice(r.invoiceNo) || null,
          ...orgFields(r, acConfig), glAccount: r.glAccount,
          revision: { increment: 1 },
          ...(keepReview ? {} : {
            status: d.status, holdReason: d.holdReason, memo: d.memo, reviewed: false,
          }),
        },
      });
      if (d.status !== "excluded") {
        await tx.checkbookPaymentRaw.upsert({
          where: { paymentId: ex.id },
          update: { memoRaw: r.memo, invoiceRaw: r.invoiceNo, checkNo: r.checkNo, document: r.document, voucher: r.voucher, po: r.po },
          create: { paymentId: ex.id, memoRaw: r.memo, invoiceRaw: r.invoiceNo, checkNo: r.checkNo, document: r.document, voucher: r.voucher, po: r.po },
        });
      } else {
        await tx.checkbookPaymentRaw.deleteMany({ where: { paymentId: ex.id } });
      }
    }
  }, { timeout: 120000, maxWait: 15000 });

  report.batchId = batchId;
  return report;
}

// ── helpers ──────────────────────────────────────────────────────────────────

interface VendorIds {
  /** erpVendorId → db id for every vendor a row in this file needs */
  byErp: Map<string, string>;
  created: Map<string, { id: string; slot: VendorSlot }>;
}

async function resolveVendorIds(
  townId: string,
  fresh: PlanRow[],
  newVendors: Map<string, VendorSlot>
): Promise<VendorIds> {
  const slots = new Map<string, VendorSlot>();
  for (const row of fresh) {
    const v = row.decision!.vendor;
    if (!slots.has(v.erpVendorId)) slots.set(v.erpVendorId, v);
  }
  for (const v of newVendors.values()) if (!slots.has(v.erpVendorId)) slots.set(v.erpVendorId, v);

  const byErp = new Map<string, string>();
  const created = new Map<string, { id: string; slot: VendorSlot }>();

  // Anything the registry already has (including placeholder vendors from earlier uploads)
  const wanted = [...slots.keys()];
  for (const part of chunks(wanted)) {
    const found = await prisma.checkbookVendor.findMany({
      where: { townId, erpVendorId: { in: part } }, select: { id: true, erpVendorId: true },
    });
    for (const f of found) byErp.set(f.erpVendorId, f.id);
  }
  for (const [erp, slot] of slots) {
    if (byErp.has(erp)) continue;
    const id = randomUUID();
    byErp.set(erp, id);
    created.set(erp, { id, slot });
  }
  return { byErp, created };
}

function buildPaymentData(
  row: PlanRow,
  townId: string,
  batchId: string,
  vendorIds: VendorIds,
  dupNotes: Map<string, string[]>,
  acConfig: AccountCodeConfig | null
) {
  const r = row.record;
  const d = row.decision!;
  const id = randomUUID();
  const vendorId = vendorIds.byErp.get(d.vendor.erpVendorId)!;
  const notes = dupNotes.get(r.naturalKey);
  const flags = notes ? [{ code: "possible_duplicate", note: notes[0] }] : [];
  return {
    payment: {
      id, townId, batchId, vendorId,
      erpVendorId: d.status === "excluded" ? "__excluded__" : r.erpVendorId,
      naturalKey: r.naturalKey, contentHash: r.contentHash,
      fiscalYear: r.fiscalYear, period: r.period, warrant: r.warrant, paymentType: r.type,
      amount: r.amount, invoiceDate: r.invoiceDate,
      invoiceNo: normalizeInvoice(r.invoiceNo) || null,
      ...orgFields(r, acConfig), glAccount: r.glAccount,
      memo: d.memo, status: d.status, holdReason: d.holdReason,
      flags: JSON.stringify(flags), reviewed: false, revision: 1,
    },
    // Confidential rows keep no raw copy at all
    raw: d.status === "excluded" ? null : {
      paymentId: id, memoRaw: r.memo, invoiceRaw: r.invoiceNo, checkNo: r.checkNo,
      document: r.document, voucher: r.voucher, po: r.po,
    },
  };
}
