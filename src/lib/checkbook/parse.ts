import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createHash } from "crypto";

// Reads the ERP "Invoice History by GL Account" extract (xlsx or csv).

export interface ErpRecord {
  rowNumber: number;
  erpVendorId: string;
  vendorName: string;
  department: string | null;
  glAccount: string | null;
  category: string | null;
  document: string;
  voucher: string | null;
  po: string | null;
  fiscalYear: string;
  period: number | null;
  type: string;
  amount: number;
  warrant: string | null;
  checkNo: string | null;
  invoiceNo: string | null;
  memo: string | null;
  invoiceDate: Date | null;
}

export interface ParseResult {
  records: ErpRecord[];
  totalRows: number;
  fileHash: string;
  skipped: {
    unpaid: number;
    zeroAmount: number;
    invalid: { row: number; reason: string }[];
  };
}

const REQUIRED = ["VENDOR NAME", "AMOUNT", "DOCUMENT", "ACCOUNT", "YEAR"];

function norm(h: string): string {
  return String(h).replace(/\s+/g, " ").trim().toUpperCase();
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\s+/g, " ").trim();
}

function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = str(v);
  if (!s) return null;
  let neg = false;
  let t = s.replace(/[$,\s]/g, "");
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith("-")) { neg = true; t = t.slice(0, -1); }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" || /^\d{5}(\.\d+)?$/.test(String(v))) {
    const serial = Number(v);
    if (serial > 20000 && serial < 80000) {
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
    }
    return null;
  }
  const s = String(v).trim();
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const y = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3]);
    return new Date(Date.UTC(y, Number(us[1]) - 1, Number(us[2])));
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return null;
}

function readRows(buffer: Buffer, fileName: string): Record<string, unknown>[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const res = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => norm(h),
    });
    return res.data;
  }
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  if (!wb.SheetNames.length) throw new Error("Excel file has no sheets.");
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
  return rows.map(r => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[norm(k)] = v;
    return out;
  });
}

export function parseErpExtract(buffer: Buffer, fileName: string): ParseResult {
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  let rows: Record<string, unknown>[];
  try {
    rows = readRows(buffer, fileName);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Could not read the file.");
  }
  if (rows.length === 0) throw new Error("The file has no data rows.");

  const present = new Set(Object.keys(rows[0]));
  const missing = REQUIRED.filter(c => !present.has(c));
  if (missing.length) {
    throw new Error(
      `This doesn't look like the invoice history extract. Missing column(s): ${missing.join(", ")}.`
    );
  }

  const records: ErpRecord[] = [];
  const skipped: ParseResult["skipped"] = { unpaid: 0, zeroAmount: 0, invalid: [] };

  rows.forEach((r, i) => {
    const rowNumber = i + 2; // header is row 1
    const status = str(r["STATUS"]).toUpperCase();
    if (present.has("STATUS") && status && status !== "P" && status !== "PAID") {
      skipped.unpaid++;
      return;
    }
    const amount = parseAmount(r["AMOUNT"]);
    if (amount === null) {
      skipped.invalid.push({ row: rowNumber, reason: "Amount is not a number" });
      return;
    }
    if (amount === 0) { skipped.zeroAmount++; return; }

    const document = str(r["DOCUMENT"]);
    const account = str(r["ACCOUNT"]);
    const vendorName = str(r["VENDOR NAME"]);
    if (!document || !account || !vendorName) {
      skipped.invalid.push({ row: rowNumber, reason: "Missing document, account, or vendor name" });
      return;
    }
    let fy = str(r["YEAR"]);
    if (/^\d{2}$/.test(fy)) fy = String(2000 + Number(fy));
    if (!/^\d{4}$/.test(fy)) {
      skipped.invalid.push({ row: rowNumber, reason: `Unrecognized fiscal year "${fy}"` });
      return;
    }

    const typeRaw = str(r["TYPE"]).toUpperCase();
    const type = typeRaw === "CRM" ? "credit" : typeRaw === "DIR" ? "direct" : amount < 0 ? "credit" : "payment";
    const period = parseInt(str(r["PERIOD"]), 10);
    const warrant = str(r["WARRANT"]);

    records.push({
      rowNumber,
      erpVendorId: str(r["VENDOR"]) || vendorName.toUpperCase(),
      vendorName,
      department: str(r["ORG DESC"]) || null,
      glAccount: account,
      category: str(r["ACCOUNT DESC"]) || null,
      document,
      voucher: str(r["VOUCHER"]) || null,
      po: str(r["PO"]) && str(r["PO"]) !== "0" ? str(r["PO"]) : null,
      fiscalYear: fy,
      period: Number.isFinite(period) ? period : null,
      type,
      amount,
      warrant: warrant || null,
      checkNo: str(r["CHECK NO"]) || null,
      invoiceNo: str(r["INVOICE"]) || null,
      memo: str(r["FULL DESC"]) || null,
      invoiceDate: parseDate(r["INVOICE DATE"]),
    });
  });

  return { records, totalRows: rows.length, fileHash, skipped };
}

// ── Identity & fingerprints ──────────────────────────────────────────────────

export type KeyedRecord = ErpRecord & { naturalKey: string; contentHash: string };

/**
 * A payment line is identified by DOCUMENT | VOUCHER | ACCOUNT.
 * (One invoice is often split across several GL accounts – e.g. one line per
 * school building – so the account is part of the identity.)
 * If the same key repeats inside one file, later copies get "#2", "#3"… in a
 * stable order so re-uploading the same data always yields the same keys.
 */
export function assignKeys(records: ErpRecord[]): KeyedRecord[] {
  const groups = new Map<string, ErpRecord[]>();
  for (const r of records) {
    const base = [r.document, r.voucher ?? "", r.glAccount ?? ""].join("|");
    const g = groups.get(base);
    if (g) g.push(r); else groups.set(base, [r]);
  }
  const out: KeyedRecord[] = [];
  for (const [base, group] of groups) {
    group.sort((a, b) =>
      a.amount - b.amount ||
      (a.invoiceNo ?? "").localeCompare(b.invoiceNo ?? "") ||
      (a.memo ?? "").localeCompare(b.memo ?? ""));
    group.forEach((r, idx) => {
      const naturalKey = idx === 0 ? base : `${base}#${idx + 1}`;
      out.push({ ...r, naturalKey, contentHash: hashContent(r) });
    });
  }
  return out.sort((a, b) => a.rowNumber - b.rowNumber);
}

export function hashContent(r: ErpRecord): string {
  return createHash("sha256")
    .update(JSON.stringify([
      r.erpVendorId, r.vendorName, r.amount.toFixed(2), r.invoiceNo, r.warrant, r.checkNo,
      r.invoiceDate ? r.invoiceDate.toISOString().slice(0, 10) : null,
      r.type, r.memo, r.department, r.category, r.glAccount, r.fiscalYear, r.period,
    ]))
    .digest("hex");
}

export function normalizeInvoice(inv: string | null | undefined): string {
  return (inv ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
