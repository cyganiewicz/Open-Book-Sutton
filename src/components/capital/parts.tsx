"use client";

import { useState, type ReactNode } from "react";
import { requestStatusLabel, projectStatusLabel } from "@/lib/capital/constants";

export class ApiError extends Error {
  constructor(message: string, public details: string[] = []) { super(message); }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "Something went wrong. Please try again.", Array.isArray(data.details) ? data.details : []);
  return data as T;
}
export const postJson = <T,>(url: string, body: unknown, method = "POST") =>
  api<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `$${Math.round(n).toLocaleString()}`);
export const moneyShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};
export const fy = (y: string) => `FY${y}`;

/** Shrinks a photo in the browser so uploads are fast and the database stays small */
export async function resizeImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file.size <= 4 * 1024 * 1024 ? file : new File([blob ?? file], file.name, { type: "image/jpeg" });
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}

const TONES: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-800",
  violet: "bg-violet-50 text-violet-700", green: "bg-emerald-50 text-emerald-800", red: "bg-red-50 text-red-700",
};
export function Pill({ tone = "gray", children }: { tone?: string; children: ReactNode }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${TONES[tone] ?? TONES.gray}`}>{children}</span>;
}
const STATUS_TONE: Record<string, string> = { draft: "gray", submitted: "blue", under_review: "amber", recommended: "violet", approved: "green", not_funded: "red", withdrawn: "gray" };
export const StatusPill = ({ status }: { status: string }) => <Pill tone={STATUS_TONE[status]}>{requestStatusLabel(status)}</Pill>;
const PS_TONE: Record<string, string> = { not_started: "gray", planning: "blue", procurement: "violet", in_progress: "amber", complete: "green", on_hold: "red", cancelled: "gray" };
export const ProjectStatusPill = ({ status }: { status: string }) => <Pill tone={PS_TONE[status]}>{projectStatusLabel(status)}</Pill>;

export function Section({ title, subtitle, children, right, id }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <section id={id} className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, locked, children, htmlFor }: { label: string; hint?: string; locked?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-800">
        {label} {locked && <span title="Locked because this project is funded" className="text-gray-400 text-xs font-normal">🔒 locked</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 mb-1">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  );
}

export const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-gray-50 disabled:text-gray-500";

export function TextArea({ value, onChange, disabled, rows = 4, id, max }: { value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number; id?: string; max?: number }) {
  return (
    <>
      <textarea id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} rows={rows} maxLength={max} className={inputCls} />
    </>
  );
}

export function MoneyInput({ value, onChange, disabled, label, placeholder = "0" }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" aria-hidden="true">$</span>
      <input aria-label={label} inputMode="decimal" value={value} disabled={disabled} placeholder={placeholder}
        onChange={e => onChange(e.target.value.replace(/[^0-9.\-]/g, ""))}
        className={`${inputCls} pl-6 text-right tabular-nums`} />
    </div>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  const tone = value >= 80 ? "bg-emerald-600" : value >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div role="img" aria-label={`${label}: ${value} of 100`}>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${tone}`} style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export function ErrorBox({ message, details }: { message: string; details?: string[] }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-medium">{message}</p>
      {details && details.length > 0 && <ul className="list-disc pl-5 mt-1">{details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
    </div>
  );
}

export function Confirm({ children, message, onConfirm, className }: { children: ReactNode; message: string; onConfirm: () => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  return <button type="button" disabled={busy} className={className} onClick={async () => { if (confirm(message)) { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } } }}>{children}</button>;
}
