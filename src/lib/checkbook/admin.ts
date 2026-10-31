// Admin-only operations for the Open Checkbook: the review queues and actions.
// Everything here may touch raw (unsanitized) data – never import it from a public route.

import { prisma } from "@/lib/db";
import {
  finishDecision, HOLD_REASON_LABEL, INDIVIDUAL_DISPLAY,
  type HoldReason, type VendorSlot, type VendorKind,
} from "./plan";
import { parseSettings, rulesToText, textToRules, matchSensitiveRule, type CheckbookSettings } from "./settings";
import { detectNames, smartCase, sanitizeMemo } from "./pii";
import { parseAccountCodeConfig, applyAccountCodeConfig } from "@/lib/account-codes";

export interface AdminOverview {
  stats: {
    publishedCount: number; publishedAmount: number;
    heldCount: number; excludedCount: number; vendorsToReview: number; flaggedCount: number;
  };
  batches: {
    id: string; fileName: string; createdAt: string; rowCount: number; newCount: number;
    duplicateCount: number; changedCount: number; heldCount: number; excludedCount: number;
    flaggedCount: number; totalAmount: number;
  }[];
  vendorsToReview: {
    id: string; erpVendorId: string; rawName: string; suggestedKind: string | null;
    paymentCount: number; total: number; categories: string[];
  }[];
  heldPayments: {
    id: string; vendorId: string; vendorName: string; vendorKind: string; amount: number;
    warrant: string | null; fiscalYear: string; category: string | null; department: string | null;
    holdReason: HoldReason; holdLabel: string; memoRaw: string | null;
    memoAsPublished: string | null; memoNameRedacted: string | null; nameHits: string[];
  }[];
  flagged: {
    id: string; vendorName: string; amount: number; warrant: string | null;
    invoice: string | null; document: string | null; voucher: string | null; note: string;
  }[];
  settings: {
    rulesText: string; largeIndividualThreshold: number; redactStreetNumbers: boolean; safePhrasesText: string;
  };
}

function toSlot(v: { id: string; erpVendorId: string; rawName: string; displayName: string; kind: string }): VendorSlot {
  return {
    erpVendorId: v.erpVendorId, rawName: v.rawName, displayName: v.displayName,
    kind: v.kind as VendorKind, suggestedKind: null, placeholder: null, existingId: v.id,
  };
}

async function loadSettings(townId: string): Promise<CheckbookSettings> {
  const t = await prisma.town.findUnique({ where: { id: townId }, select: { checkbookSettings: true } });
  return parseSettings(t?.checkbookSettings);
}

export async function getAdminOverview(townId: string): Promise<AdminOverview> {
  const settings = await loadSettings(townId);

  const [published, held, excluded, reviewVendors, flaggedCount, batches] = await Promise.all([
    prisma.checkbookPayment.aggregate({ where: { townId, status: "published" }, _count: true, _sum: { amount: true } }),
    prisma.checkbookPayment.count({ where: { townId, status: "held" } }),
    prisma.checkbookPayment.count({ where: { townId, status: "excluded" } }),
    prisma.checkbookVendor.findMany({
      where: { townId, kind: "review" },
      select: { id: true, erpVendorId: true, rawName: true, suggestedKind: true },
      orderBy: { rawName: "asc" },
    }),
    prisma.checkbookPayment.count({ where: { townId, flags: { contains: "possible_duplicate" } } }),
    prisma.checkbookBatch.findMany({ where: { townId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  // Vendor review queue with a little context so the reviewer can decide quickly
  const ids = reviewVendors.map(v => v.id);
  const agg = ids.length
    ? await prisma.checkbookPayment.groupBy({
        by: ["vendorId"], where: { townId, vendorId: { in: ids } }, _count: true, _sum: { amount: true },
      })
    : [];
  const cats = ids.length
    ? await prisma.checkbookPayment.findMany({
        where: { townId, vendorId: { in: ids } }, select: { vendorId: true, category: true },
        distinct: ["vendorId", "category"],
      })
    : [];
  const vendorsToReview = reviewVendors.map(v => {
    const a = agg.find(x => x.vendorId === v.id);
    return {
      ...v,
      paymentCount: a?._count ?? 0,
      total: Math.round((a?._sum.amount ?? 0) * 100) / 100,
      categories: cats.filter(c => c.vendorId === v.id && c.category).map(c => c.category!).slice(0, 3),
    };
  });

  const heldRows = await prisma.checkbookPayment.findMany({
    where: { townId, status: "held", NOT: { holdReason: "vendor_review" } },
    orderBy: { amount: "desc" },
    take: 200,
    select: {
      id: true, amount: true, warrant: true, fiscalYear: true, category: true, department: true, holdReason: true,
      vendor: { select: { id: true, rawName: true, kind: true } },
      raw: { select: { memoRaw: true } },
    },
  });
  const heldPayments = heldRows.map(h => {
    const san = sanitizeMemo(h.raw?.memoRaw ?? null, { redactStreetNumbers: settings.redactStreetNumbers });
    const det = detectNames(san.text, settings.safePhrases);
    const reason = (h.holdReason ?? "memo_name") as HoldReason;
    return {
      id: h.id, vendorId: h.vendor.id, vendorName: h.vendor.rawName, vendorKind: h.vendor.kind,
      amount: h.amount, warrant: h.warrant, fiscalYear: h.fiscalYear, category: h.category, department: h.department,
      holdReason: reason, holdLabel: HOLD_REASON_LABEL[reason] ?? reason,
      memoRaw: h.raw?.memoRaw ?? null, memoAsPublished: san.text,
      memoNameRedacted: det.names.length ? det.redacted : san.text, nameHits: det.names,
    };
  });

  const flaggedRows = await prisma.checkbookPayment.findMany({
    where: { townId, flags: { contains: "possible_duplicate" } },
    orderBy: { amount: "desc" }, take: 100,
    select: {
      id: true, amount: true, warrant: true, flags: true,
      vendor: { select: { rawName: true, displayName: true, kind: true } },
      raw: { select: { invoiceRaw: true, document: true, voucher: true } },
    },
  });
  const flagged = flaggedRows.map(f => {
    let note = "";
    try { note = (JSON.parse(f.flags) as { note: string }[])[0]?.note ?? ""; } catch { /* ignore */ }
    return {
      id: f.id, vendorName: f.vendor.rawName, amount: f.amount, warrant: f.warrant,
      invoice: f.raw?.invoiceRaw ?? null, document: f.raw?.document ?? null, voucher: f.raw?.voucher ?? null, note,
    };
  });

  return {
    stats: {
      publishedCount: published._count, publishedAmount: Math.round((published._sum.amount ?? 0) * 100) / 100,
      heldCount: held, excludedCount: excluded, vendorsToReview: reviewVendors.length, flaggedCount,
    },
    batches: batches.map(b => ({
      id: b.id, fileName: b.fileName, createdAt: b.createdAt.toISOString(), rowCount: b.rowCount,
      newCount: b.newCount, duplicateCount: b.duplicateCount, changedCount: b.changedCount,
      heldCount: b.heldCount, excludedCount: b.excludedCount, flaggedCount: b.flaggedCount, totalAmount: b.totalAmount,
    })),
    vendorsToReview,
    heldPayments,
    flagged,
    settings: {
      rulesText: rulesToText(settings.sensitiveRules),
      largeIndividualThreshold: settings.largeIndividualThreshold,
      redactStreetNumbers: settings.redactStreetNumbers,
      safePhrasesText: settings.safePhrases.join("\n"),
    },
  };
}

// ── Re-evaluating payments after a human decision ────────────────────────────

async function reevaluateVendorPayments(townId: string, vendor: { id: string; erpVendorId: string; rawName: string; displayName: string; kind: string }, settings: CheckbookSettings) {
  const slot = toSlot(vendor);
  const payments = await prisma.checkbookPayment.findMany({
    where: { townId, vendorId: vendor.id, status: { not: "excluded" } },
    select: { id: true, amount: true, category: true, reviewed: true, raw: { select: { memoRaw: true } } },
  });
  const ops = payments.map(p => {
    const sensitiveHold = matchSensitiveRule(settings, p.category)?.action === "hold";
    const d = finishDecision(slot, p.amount, p.raw?.memoRaw ?? null, settings, sensitiveHold);
    if (vendor.kind === "individual") {
      // A person's free-text memo is never public, even on rows someone already approved
      return prisma.checkbookPayment.update({
        where: { id: p.id },
        data: p.reviewed ? { memo: null } : { memo: null, status: d.status, holdReason: d.holdReason },
      });
    }
    if (p.reviewed) return null; // keep the earlier human decision
    return prisma.checkbookPayment.update({
      where: { id: p.id }, data: { status: d.status, holdReason: d.holdReason, memo: d.memo },
    });
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  for (let i = 0; i < ops.length; i += 100) await prisma.$transaction(ops.slice(i, i + 100));
  return payments.length;
}

export async function classifyVendor(opts: {
  townId: string; vendorId: string; kind: "business" | "individual"; displayName?: string; by?: string | null;
}) {
  const vendor = await prisma.checkbookVendor.findFirst({ where: { id: opts.vendorId, townId: opts.townId } });
  if (!vendor) throw new Error("Vendor not found.");
  if (vendor.erpVendorId.startsWith("__")) throw new Error("System placeholder vendors cannot be changed.");
  const displayName =
    opts.kind === "individual" ? INDIVIDUAL_DISPLAY : (opts.displayName?.trim() || smartCase(vendor.rawName)).slice(0, 120);
  const updated = await prisma.checkbookVendor.update({
    where: { id: vendor.id },
    data: { kind: opts.kind, displayName, decidedBy: opts.by ?? null, decidedAt: new Date() },
  });
  const settings = await loadSettings(opts.townId);
  const affected = await reevaluateVendorPayments(opts.townId, updated, settings);
  return { affected };
}

export async function bulkApproveSuggestedBusiness(townId: string, by?: string | null) {
  const vendors = await prisma.checkbookVendor.findMany({
    where: { townId, kind: "review", suggestedKind: "business" },
  });
  let affected = 0;
  for (const v of vendors) {
    const r = await classifyVendor({ townId, vendorId: v.id, kind: "business", by });
    affected += r.affected;
  }
  return { vendors: vendors.length, affected };
}

export type ResolveAction = "publish_as_written" | "publish_name_redacted" | "publish_no_memo" | "exclude";

export async function resolvePayment(opts: { townId: string; paymentId: string; action: ResolveAction }) {
  const p = await prisma.checkbookPayment.findFirst({
    where: { id: opts.paymentId, townId: opts.townId },
    select: { id: true, vendor: { select: { kind: true } }, raw: { select: { memoRaw: true } } },
  });
  if (!p) throw new Error("Payment not found.");
  if (opts.action !== "exclude" && p.vendor.kind === "review") {
    throw new Error("Classify the vendor first.");
  }
  const settings = await loadSettings(opts.townId);
  const base = sanitizeMemo(p.raw?.memoRaw ?? null, { redactStreetNumbers: settings.redactStreetNumbers }).text;

  if (opts.action === "exclude") {
    await prisma.$transaction([
      prisma.checkbookPayment.update({ where: { id: p.id }, data: { status: "excluded", holdReason: null, memo: null, reviewed: true } }),
      prisma.checkbookPaymentRaw.deleteMany({ where: { paymentId: p.id } }),
    ]);
    return;
  }
  let memo: string | null = base;
  if (p.vendor.kind === "individual" || opts.action === "publish_no_memo") memo = null;
  else if (opts.action === "publish_name_redacted") memo = detectNames(base, settings.safePhrases).redacted || null;

  await prisma.checkbookPayment.update({
    where: { id: p.id }, data: { status: "published", holdReason: null, memo, reviewed: true },
  });
}

export async function dismissFlag(townId: string, paymentId: string) {
  await prisma.checkbookPayment.updateMany({ where: { id: paymentId, townId }, data: { flags: "[]" } });
}

export async function recheckHeld(townId: string) {
  const settings = await loadSettings(townId);
  const rows = await prisma.checkbookPayment.findMany({
    where: { townId, status: "held", reviewed: false },
    select: {
      id: true, amount: true, category: true,
      vendor: { select: { id: true, erpVendorId: true, rawName: true, displayName: true, kind: true } },
      raw: { select: { memoRaw: true } },
    },
  });
  let released = 0;
  for (const r of rows) {
    const sensitiveHold = matchSensitiveRule(settings, r.category)?.action === "hold";
    const d = finishDecision(toSlot(r.vendor), r.amount, r.raw?.memoRaw ?? null, settings, sensitiveHold);
    await prisma.checkbookPayment.update({
      where: { id: r.id }, data: { status: d.status, holdReason: d.holdReason, memo: d.memo },
    });
    if (d.status === "published") released++;
  }
  return { checked: rows.length, released };
}

export async function saveSettings(townId: string, input: {
  rulesText: string; largeIndividualThreshold: number; redactStreetNumbers: boolean; safePhrasesText: string;
}) {
  const settings: CheckbookSettings = {
    sensitiveRules: textToRules(input.rulesText),
    largeIndividualThreshold: Math.max(0, Number(input.largeIndividualThreshold) || 0),
    redactStreetNumbers: !!input.redactStreetNumbers,
    safePhrases: input.safePhrasesText.split("\n").map(s => s.trim()).filter(Boolean),
  };
  await prisma.town.update({ where: { id: townId }, data: { checkbookSettings: JSON.stringify(settings) } });
}

export async function deleteBatch(townId: string, batchId: string) {
  const b = await prisma.checkbookBatch.findFirst({ where: { id: batchId, townId } });
  if (!b) throw new Error("Batch not found.");
  await prisma.checkbookBatch.delete({ where: { id: batchId } });
  // Vendors that only existed in this batch go away with it (their decisions would be re-asked next time)
  await prisma.checkbookVendor.deleteMany({ where: { townId, payments: { none: {} } } });
}

/** Re-derive function area / department for existing payments after the Account Codes setup changes */
export async function reapplyAccountCodes(townId: string) {
  const town = await prisma.town.findUnique({ where: { id: townId }, select: { accountCodeRules: true } });
  const config = parseAccountCodeConfig(town?.accountCodeRules || "");
  if (!config) throw new Error("No account code setup found. Configure it under Account Codes first.");
  const rows = await prisma.checkbookPayment.findMany({
    where: { townId, glAccount: { not: null } },
    select: { id: true, glAccount: true, department: true, functionArea: true },
  });
  let updated = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const ops = rows.slice(i, i + 200).flatMap(r => {
      const d = applyAccountCodeConfig(r.glAccount, r.department, config);
      const functionArea = d.functionArea || null;
      const department = d.department || r.department;
      if (functionArea === r.functionArea && department === r.department) return [];
      updated++;
      return [prisma.checkbookPayment.update({ where: { id: r.id }, data: { functionArea, department } })];
    });
    if (ops.length) await prisma.$transaction(ops);
  }
  return { checked: rows.length, updated };
}
