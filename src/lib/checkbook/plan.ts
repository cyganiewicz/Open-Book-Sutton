// Pure decision logic (no database access): given parsed rows, what is the
// status of each one? Used both when ingesting a file and when an admin
// reclassifies a vendor, so the rules can never drift apart.

import type { KeyedRecord } from "./parse";
import { normalizeInvoice } from "./parse";
import type { CheckbookSettings } from "./settings";
import { matchSensitiveRule } from "./settings";
import { classifyVendor, smartCase, sanitizeMemo, detectNames } from "./pii";

export type PaymentStatus = "published" | "held" | "excluded";
export type HoldReason = "sensitive_account" | "vendor_review" | "memo_name" | "large_individual";
export type VendorKind = "business" | "individual" | "review";

export const HOLD_REASON_LABEL: Record<HoldReason, string> = {
  sensitive_account: "Sensitive account (salary, settlement, etc.)",
  vendor_review: "Vendor needs to be classified",
  memo_name: "Memo may contain a person's name",
  large_individual: "Large payment to an individual",
};

export const EXCLUDED_VENDOR_ID = "__excluded__";
export const INDIVIDUAL_DISPLAY = "Individual payee (name withheld)";
export const PENDING_DISPLAY = "Pending review";

export interface RegistryVendor {
  id: string;
  erpVendorId: string;
  rawName: string;
  displayName: string;
  kind: VendorKind;
}

/** Which registry entry a payment attaches to (existing, or one we must create) */
export interface VendorSlot {
  erpVendorId: string;
  rawName: string;
  displayName: string;
  kind: VendorKind;
  suggestedKind: "business" | "individual" | "unsure" | null;
  placeholder: "excluded" | "redacted" | null;
  existingId: string | null;
}

export interface Decision {
  vendor: VendorSlot;
  status: PaymentStatus;
  holdReason: HoldReason | null;
  /** Public-safe memo (automatic redactions applied; names NOT yet removed) */
  memo: string | null;
  redactions: string[];
  nameHits: string[];
}

export interface DecideInput {
  erpVendorId: string;
  vendorName: string;
  amount: number;
  category: string | null;
  department: string | null;
  memoRaw: string | null;
  settings: CheckbookSettings;
  registry: Map<string, RegistryVendor>;
  /** classification cache so a new vendor is judged once per file */
  newVendors: Map<string, VendorSlot>;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function decideRow(input: DecideInput): Decision {
  const { settings } = input;
  const rule = matchSensitiveRule(settings, input.category);

  // 1. Confidential categories: counted, never published, no PII retained.
  if (rule?.action === "exclude") {
    return {
      vendor: {
        erpVendorId: EXCLUDED_VENDOR_ID, rawName: "(excluded)", displayName: "Excluded (confidential)",
        kind: "individual", suggestedKind: null, placeholder: "excluded", existingId: null,
      },
      status: "excluded", holdReason: null, memo: null, redactions: [], nameHits: [],
    };
  }

  // 2. Refund-style categories: published, but the payee is replaced by a label.
  if (rule?.action === "redact") {
    const label = rule.label || "Refund (payee name withheld)";
    return {
      vendor: {
        erpVendorId: `__redacted__:${slug(label)}`, rawName: "(redacted)", displayName: label,
        kind: "individual", suggestedKind: null, placeholder: "redacted", existingId: null,
      },
      status: "published", holdReason: null, memo: null, redactions: [], nameHits: [],
    };
  }

  // 3. Everyone else: look the vendor up, or judge a new one.
  const reg = input.registry.get(input.erpVendorId);
  let vendor: VendorSlot;
  if (reg) {
    vendor = {
      erpVendorId: reg.erpVendorId, rawName: reg.rawName, displayName: reg.displayName,
      kind: reg.kind, suggestedKind: null, placeholder: null, existingId: reg.id,
    };
  } else {
    const cached = input.newVendors.get(input.erpVendorId);
    if (cached) {
      vendor = cached;
    } else {
      const c = classifyVendor(input.vendorName);
      vendor = {
        erpVendorId: input.erpVendorId, rawName: input.vendorName,
        displayName: c.kind === "business" ? smartCase(input.vendorName) : PENDING_DISPLAY,
        kind: c.kind, suggestedKind: c.suggested, placeholder: null, existingId: null,
      };
      input.newVendors.set(input.erpVendorId, vendor);
    }
  }

  return finishDecision(vendor, input.amount, input.memoRaw, settings, rule?.action === "hold");
}

/** Shared by ingest and by reclassification of an existing vendor */
export function finishDecision(
  vendor: VendorSlot,
  amount: number,
  memoRaw: string | null,
  settings: CheckbookSettings,
  sensitiveHold: boolean
): Decision {
  const san = sanitizeMemo(memoRaw, { redactStreetNumbers: settings.redactStreetNumbers });
  let memo = san.text;
  let nameHits: string[] = [];
  let status: PaymentStatus = "published";
  const reasons: HoldReason[] = [];

  if (vendor.kind === "individual") {
    memo = null; // never publish free text about a person
    if (Math.abs(amount) >= settings.largeIndividualThreshold) reasons.push("large_individual");
  } else if (vendor.kind === "review") {
    reasons.push("vendor_review");
  }
  if (sensitiveHold) reasons.push("sensitive_account");

  if (memo) {
    nameHits = detectNames(memo, settings.safePhrases).names;
    if (nameHits.length) reasons.push("memo_name");
  }

  let holdReason: HoldReason | null = null;
  if (reasons.length) {
    status = "held";
    // Most actionable first
    const order: HoldReason[] = ["vendor_review", "sensitive_account", "large_individual", "memo_name"];
    holdReason = order.find(r => reasons.includes(r)) ?? reasons[0];
  }
  return { vendor, status, holdReason, memo, redactions: san.redactions, nameHits };
}

// ── Whole-file planning ──────────────────────────────────────────────────────

export interface ExistingPayment {
  id: string;
  naturalKey: string;
  contentHash: string;
  status: PaymentStatus;
  reviewed: boolean;
  vendorId: string;
  memo: string | null;
  memoRaw: string | null;
  erpVendorId: string;
}

export type RowState = "new" | "duplicate" | "changed";

export interface PlanRow {
  record: KeyedRecord;
  state: RowState;
  existing: ExistingPayment | null;
  decision: Decision | null; // null for exact duplicates
}

export interface ExtractPlan {
  rows: PlanRow[];
  newVendors: Map<string, VendorSlot>;
}

export function planExtract(
  records: KeyedRecord[],
  ctx: {
    settings: CheckbookSettings;
    registry: Map<string, RegistryVendor>;
    existing: Map<string, ExistingPayment>;
  }
): ExtractPlan {
  const newVendors = new Map<string, VendorSlot>();
  const rows: PlanRow[] = records.map(record => {
    const existing = ctx.existing.get(record.naturalKey) ?? null;
    if (existing && existing.contentHash === record.contentHash) {
      return { record, state: "duplicate" as const, existing, decision: null };
    }
    const decision = decideRow({
      erpVendorId: record.erpVendorId,
      vendorName: record.vendorName,
      amount: record.amount,
      category: record.category,
      department: record.department,
      memoRaw: record.memo,
      settings: ctx.settings,
      registry: ctx.registry,
      newVendors,
    });
    return { record, state: existing ? ("changed" as const) : ("new" as const), existing, decision };
  });
  return { rows, newVendors };
}

// ── Possible duplicate payments (the "did we pay this twice?" check) ─────────
// An exact re-upload is caught by the natural key. THIS catches the harder case:
// a different voucher paying the same vendor the same invoice for the same amount.

export interface DupCandidate {
  naturalKey: string;
  erpVendorId: string;
  invoiceNorm: string;
  amount: number;
  document: string;
  voucher: string | null;
  warrant: string | null;
}

export function findPossibleDuplicates(
  fresh: KeyedRecord[],
  existing: DupCandidate[]
): Map<string, string[]> {
  const asCandidate = (r: KeyedRecord): DupCandidate => ({
    naturalKey: r.naturalKey, erpVendorId: r.erpVendorId, invoiceNorm: normalizeInvoice(r.invoiceNo),
    amount: r.amount, document: r.document, voucher: r.voucher, warrant: r.warrant,
  });
  const usable = (c: DupCandidate) =>
    c.invoiceNorm.length >= 4 &&
    c.invoiceNorm !== normalizeInvoice(c.document) &&
    c.invoiceNorm !== normalizeInvoice(c.voucher);

  const groups = new Map<string, DupCandidate[]>();
  const push = (c: DupCandidate) => {
    if (!usable(c)) return;
    const k = `${c.erpVendorId}|${c.invoiceNorm}|${Math.abs(c.amount).toFixed(2)}`;
    const g = groups.get(k);
    if (g) g.push(c); else groups.set(k, [c]);
  };
  existing.forEach(push);
  fresh.map(asCandidate).forEach(push);

  const out = new Map<string, string[]>();
  for (const r of fresh) {
    const me = asCandidate(r);
    if (!usable(me)) continue;
    const k = `${me.erpVendorId}|${me.invoiceNorm}|${Math.abs(me.amount).toFixed(2)}`;
    const others = (groups.get(k) ?? []).filter(
      o => o.naturalKey !== me.naturalKey && !(o.document === me.document && (o.voucher ?? "") === (me.voucher ?? ""))
    );
    if (others.length) {
      const first = others[0];
      out.set(
        r.naturalKey,
        [`Same vendor, invoice and amount as document ${first.document}${first.warrant ? ` (warrant ${first.warrant})` : ""}`]
      );
    }
  }
  return out;
}
