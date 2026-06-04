import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ParsedFile } from "@/types";

export function parseCSV(content: string): ParsedFile {
  if (!content.trim()) {
    throw new Error("CSV file is empty or contains only whitespace.");
  }

  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    const firstError = result.errors[0];
    throw new Error(
      `CSV parse error on row ${firstError.row ?? "?"}: ${firstError.message}`
    );
  }

  const headers = result.meta.fields || [];
  if (headers.length === 0) {
    throw new Error("No column headers found in CSV file.");
  }

  return {
    headers,
    rows: result.data,
  };
}

export function parseExcel(buffer: ArrayBuffer): ParsedFile {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch {
    throw new Error("Could not read Excel file. It may be corrupted or in an unsupported format.");
  }

  if (workbook.SheetNames.length === 0) {
    throw new Error("Excel file has no sheets.");
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: "",
    raw: false,
  });

  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  if (headers.length === 0) {
    throw new Error("Excel sheet is empty or has no column headers.");
  }

  return {
    headers,
    rows: data,
  };
}

export function parseFile(
  content: string | ArrayBuffer,
  fileType: "csv" | "xlsx"
): ParsedFile {
  if (fileType === "csv") {
    return parseCSV(content as string);
  }
  return parseExcel(content as ArrayBuffer);
}

// ---------------------------------------------------------------------------
// Row-cleaning utilities for non-standard municipal budget layouts
// ---------------------------------------------------------------------------

const TITLE_PATTERNS = [
  /\btown\s+of\b/i,
  /\bcity\s+of\b/i,
  /\bfy\s*20\d{2}\b/i,
  /\bbudget\b/i,
  /\bschedule\s+[a-z]/i,
];

const TOTAL_KEYWORDS = new Set([
  "total",
  "totals",
  "subtotal",
  "sub-total",
  "grand total",
]);

function stripDecoration(value: string): string {
  return value.replace(/^[\s*_\-:]+|[\s*_\-:]+$/g, "").trim();
}

function isTotalLabel(cell: string): boolean {
  const stripped = stripDecoration(cell).toLowerCase();
  return TOTAL_KEYWORDS.has(stripped);
}

function isBlankRow(row: Record<string, string>): boolean {
  return Object.values(row).every((v) => !v || !String(v).trim());
}

function isTitleRow(row: Record<string, string>, columnCount: number): boolean {
  const nonEmpty = Object.values(row).filter((v) => v && String(v).trim());
  if (nonEmpty.length !== 1 || columnCount < 2) return false;
  const cell = String(nonEmpty[0]).trim();
  return TITLE_PATTERNS.some((p) => p.test(cell));
}

function isSubtotalRow(row: Record<string, string>): boolean {
  for (const value of Object.values(row)) {
    const trimmed = value != null ? String(value).trim() : "";
    if (trimmed) {
      return isTotalLabel(trimmed);
    }
  }
  return false;
}

export function cleanRows(parsed: ParsedFile): ParsedFile {
  const columnCount = parsed.headers.length;

  const cleaned = parsed.rows.filter((row) => {
    if (isBlankRow(row)) return false;
    if (isTitleRow(row, columnCount)) return false;
    if (isSubtotalRow(row)) return false;
    return true;
  });

  return { headers: parsed.headers, rows: cleaned };
}
