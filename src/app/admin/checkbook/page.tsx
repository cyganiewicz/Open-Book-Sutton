"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import HelpBox from "@/components/admin/HelpBox";
import { formatCurrency } from "@/lib/format";
import type { AdminOverview } from "@/lib/checkbook/admin";
import type { UploadReport } from "@/lib/checkbook/ingest";

interface Town { id: string; name: string; slug: string }
type Tab = "vendors" | "held" | "flags";

const money = (n: number) => formatCurrency(n);
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export default function AdminCheckbookPage() {
  const [town, setTown] = useState<Town | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<UploadReport | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("vendors");
  const [names, setNames] = useState<Record<string, string>>({});

  const [rulesText, setRulesText] = useState("");
  const [threshold, setThreshold] = useState("10000");
  const [streets, setStreets] = useState(true);
  const [safePhrases, setSafePhrases] = useState("");

  const load = useCallback(async (townId: string) => {
    const res = await fetch(`/api/checkbook/admin?townId=${townId}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not load checkbook data.");
    const data: AdminOverview = await res.json();
    setOverview(data);
    setRulesText(data.settings.rulesText);
    setThreshold(String(data.settings.largeIndividualThreshold));
    setStreets(data.settings.redactStreetNumbers);
    setSafePhrases(data.settings.safePhrasesText);
    // Land on whichever queue has work
    setTab(t => data.vendorsToReview.length ? "vendors" : data.heldPayments.length ? "held" : data.flagged.length ? "flags" : t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const towns: Town[] = await (await fetch("/api/towns")).json();
        if (!towns.length) { setLoading(false); return; }
        setTown(towns[0]);
        await load(towns[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load.");
      } finally { setLoading(false); }
    })();
  }, [load]);

  async function act(label: string, body: Record<string, unknown>, success?: string) {
    if (!town) return;
    setBusy(label); setError(""); setNotice("");
    try {
      const res = await fetch("/api/checkbook/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ townId: town.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      await load(town.id);
      if (success) setNotice(success);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally { setBusy(null); }
  }

  async function sendFile(mode: "preview" | "commit") {
    if (!file || !town) return;
    const form = new FormData();
    form.append("file", file); form.append("townId", town.id); form.append("mode", mode);
    setError(""); setNotice("");
    mode === "preview" ? setAnalyzing(true) : setPublishing(true);
    try {
      const res = await fetch("/api/checkbook/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      if (mode === "preview") { setReport(data); }
      else {
        setReport(null); setFile(null); if (fileInput.current) fileInput.current.value = "";
        await load(town.id);
        setNotice(data.batchId
          ? `Added ${data.counts.new} new payment${data.counts.new === 1 ? "" : "s"}${data.counts.changed ? ` and updated ${data.counts.changed}` : ""}. ${data.counts.duplicate} already-loaded payment${data.counts.duplicate === 1 ? " was" : "s were"} skipped.`
          : "Nothing new to add — every payment in that file was already loaded.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally { setAnalyzing(false); setPublishing(false); }
  }

  if (loading) return <p className="text-gray-500 py-10 text-center">Loading…</p>;
  if (!town) return <p className="text-gray-500">No town configured. <Link href="/admin/setup" className="text-blue-600 hover:underline">Set up your town</Link> first.</p>;

  const o = overview;
  const suggestedBusiness = o?.vendorsToReview.filter(v => v.suggestedKind === "business").length ?? 0;

  return (
    <div className="space-y-10 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Open Checkbook</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Upload the monthly vendor-payment extract from your accounting system. Duplicates are skipped, personal information is screened, and you review anything uncertain before it goes public.
          </p>
        </div>
        <a href={`/${town.slug}/checkbook`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline whitespace-nowrap">View public page ↗</a>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {/* Stats */}
      {o && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Published" value={o.stats.publishedCount.toLocaleString()} sub={money(o.stats.publishedAmount)} />
          <Stat label="Vendors to review" value={String(o.stats.vendorsToReview)} warn={o.stats.vendorsToReview > 0} />
          <Stat label="Held payments" value={String(o.stats.heldCount)} warn={o.stats.heldCount > 0} />
          <Stat label="Possible duplicates" value={String(o.stats.flaggedCount)} warn={o.stats.flaggedCount > 0} />
          <Stat label="Withheld (confidential)" value={String(o.stats.excludedCount)} />
        </div>
      )}

      {/* ── 1. Upload ───────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">1. Upload a new extract</h2>
        <HelpBox title="How it works" variant="info">
          <p>Choose the “Invoice History” export (.xlsx or .csv). We’ll analyze it first and show you exactly what would change — nothing is saved until you click Publish. Each payment is identified by its document, voucher and account, so uploading overlapping or repeated files never creates duplicates.</p>
        </HelpBox>

        <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <input ref={fileInput} type="file" accept=".xlsx,.csv" aria-label="Choose invoice history file"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setReport(null); setError(""); setNotice(""); }}
            className="text-sm flex-1" />
          <button onClick={() => sendFile("preview")} disabled={!file || analyzing}
            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50">
            {analyzing ? "Analyzing…" : "Analyze file"}
          </button>
        </div>

        {report && <ReportCard report={report} publishing={publishing} onPublish={() => sendFile("commit")} onCancel={() => { setReport(null); setFile(null); if (fileInput.current) fileInput.current.value = ""; }} />}
      </section>

      {/* ── 2. Review ───────────────────────────────────────── */}
      {o && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">2. Review</h2>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit" role="tablist">
            <TabBtn active={tab === "vendors"} onClick={() => setTab("vendors")} count={o.vendorsToReview.length}>Vendors</TabBtn>
            <TabBtn active={tab === "held"} onClick={() => setTab("held")} count={o.heldPayments.length}>Held payments</TabBtn>
            <TabBtn active={tab === "flags"} onClick={() => setTab("flags")} count={o.flagged.length}>Possible duplicates</TabBtn>
          </div>

          {tab === "vendors" && (
            <div className="space-y-3">
              <HelpBox title="Why am I seeing this?" variant="warning">
                <p>These payees could be a person or a small business, so their payments are on hold. Choose <strong>Business</strong> to show the name publicly, or <strong>Individual</strong> to hide the name (the payment still appears as “Individual payee”). Your answer is remembered for every future upload.</p>
              </HelpBox>
              {suggestedBusiness > 0 && (
                <button onClick={() => { if (confirm(`Approve ${suggestedBusiness} vendors that look like organizations (single-word names such as brands or agencies)? Their names will be shown publicly.`)) act("bulk", { action: "bulkApprove" }, "Approved the suggested businesses."); }}
                  disabled={busy === "bulk"} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50">
                  {busy === "bulk" ? "Approving…" : `Approve ${suggestedBusiness} suggested business${suggestedBusiness === 1 ? "" : "es"}`}
                </button>
              )}
              {o.vendorsToReview.length === 0 ? <Empty>All vendors have been classified.</Empty> : (
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {o.vendorsToReview.map(v => (
                    <div key={v.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{v.rawName} <span className="text-xs font-normal text-gray-400">#{v.erpVendorId}</span></p>
                        <p className="text-xs text-gray-500">
                          {v.paymentCount} payment{v.paymentCount === 1 ? "" : "s"} · {money(v.total)}
                          {v.categories.length > 0 && ` · ${v.categories.join(", ")}`}
                        </p>
                        {v.suggestedKind && v.suggestedKind !== "unsure" && (
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${v.suggestedKind === "individual" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                            Looks like {v.suggestedKind === "individual" ? "a person" : "an organization"}
                          </span>
                        )}
                        {v.suggestedKind === "unsure" && <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Could be either</span>}
                      </div>
                      <input value={names[v.id] ?? ""} onChange={e => setNames(n => ({ ...n, [v.id]: e.target.value }))}
                        placeholder="Public name (optional)" aria-label={`Public name for ${v.rawName}`}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm w-full lg:w-56" />
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => act(`v-${v.id}`, { action: "classifyVendor", vendorId: v.id, kind: "business", displayName: names[v.id] })} disabled={busy === `v-${v.id}`}
                          className="px-3 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50">Business</button>
                        <button onClick={() => act(`v-${v.id}`, { action: "classifyVendor", vendorId: v.id, kind: "individual" })} disabled={busy === `v-${v.id}`}
                          className="px-3 py-2 border border-gray-300 bg-white rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Individual</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "held" && (
            <div className="space-y-3">
              {o.heldPayments.length === 0 ? <Empty>No payments are being held.</Empty> : o.heldPayments.map(h => (
                <div key={h.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-900">{h.vendorName} <span className="text-xs font-normal text-gray-400">({h.vendorKind})</span></p>
                      <p className="text-xs text-gray-500">{h.category ?? "—"} · {h.department ?? "—"} · {h.warrant ? `Warrant ${h.warrant}` : "No warrant"}</p>
                    </div>
                    <p className="font-bold tabular-nums">{money(h.amount)}</p>
                  </div>
                  <p className="text-xs font-semibold text-amber-700 bg-amber-50 inline-block px-2 py-1 rounded">{h.holdLabel}</p>
                  {h.memoRaw && (
                    <div className="text-sm bg-gray-50 rounded-lg p-3 space-y-1">
                      <p><span className="text-gray-400">Memo in ERP:</span> {h.memoRaw}</p>
                      {h.nameHits.length > 0 && <p><span className="text-gray-400">Possible name(s):</span> <strong>{h.nameHits.join(", ")}</strong></p>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {h.nameHits.length > 0 && <Btn primary busy={busy === `h-${h.id}`} onClick={() => act(`h-${h.id}`, { action: "resolvePayment", paymentId: h.id, resolution: "publish_name_redacted" })}>Publish with name removed</Btn>}
                    <Btn busy={busy === `h-${h.id}`} onClick={() => act(`h-${h.id}`, { action: "resolvePayment", paymentId: h.id, resolution: "publish_no_memo" })}>Publish without memo</Btn>
                    {h.nameHits.length > 0
                      ? <Btn busy={busy === `h-${h.id}`} onClick={() => { if (confirm("Publish this memo exactly as written, including the name(s) shown?")) act(`h-${h.id}`, { action: "resolvePayment", paymentId: h.id, resolution: "publish_as_written" }); }}>Publish as written</Btn>
                      : <Btn busy={busy === `h-${h.id}`} onClick={() => act(`h-${h.id}`, { action: "resolvePayment", paymentId: h.id, resolution: "publish_as_written" })}>Publish</Btn>}
                    {h.holdReason === "large_individual" && <Btn busy={busy === `h-${h.id}`} onClick={() => act(`h-${h.id}`, { action: "classifyVendor", vendorId: h.vendorId, kind: "business" })}>This is a business — show name</Btn>}
                    <Btn danger busy={busy === `h-${h.id}`} onClick={() => { if (confirm("Withhold this payment from the public site entirely?")) act(`h-${h.id}`, { action: "resolvePayment", paymentId: h.id, resolution: "exclude" }); }}>Keep hidden</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "flags" && (
            <div className="space-y-3">
              <HelpBox title="Did we pay this twice?" variant="info">
                <p>These payments share a vendor, invoice number, and amount with another payment under a different voucher. They are <strong>already published</strong> — this list is for your Finance team to confirm whether it’s a true duplicate payment. Split charges on the same voucher are never flagged.</p>
              </HelpBox>
              {o.flagged.length === 0 ? <Empty>No possible duplicate payments.</Empty> : (
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {o.flagged.map(f => (
                    <div key={f.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{f.vendorName} · <span className="tabular-nums">{money(f.amount)}</span></p>
                        <p className="text-xs text-gray-500">Invoice {f.invoice ?? "—"} · document {f.document ?? "—"}{f.warrant ? ` · warrant ${f.warrant}` : ""}</p>
                        <p className="text-xs text-amber-700 mt-1">{f.note}</p>
                      </div>
                      <Btn busy={busy === `f-${f.id}`} onClick={() => act(`f-${f.id}`, { action: "dismissFlag", paymentId: f.id })}>Dismiss</Btn>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── 3. History ──────────────────────────────────────── */}
      {o && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-800">3. Upload history</h2>
          {o.batches.length === 0 ? <Empty>No uploads yet.</Empty> : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">File</th><th className="px-3 py-2">Uploaded</th><th className="px-3 py-2 text-right">New</th>
                  <th className="px-3 py-2 text-right">Skipped</th><th className="px-3 py-2 text-right">Updated</th><th className="px-3 py-2 text-right">Held</th><th className="px-3 py-2 text-right">Amount</th><th />
                </tr></thead>
                <tbody>
                  {o.batches.map(b => (
                    <tr key={b.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium text-gray-800">{b.fileName}</td>
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDateTime(b.createdAt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.newCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{b.duplicateCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{b.changedCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{b.heldCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(b.totalAmount)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => { if (confirm(`Remove all ${b.newCount} payments added by “${b.fileName}”? Payments from other uploads are not affected.`)) act(`b-${b.id}`, { action: "deleteBatch", batchId: b.id }, "Upload removed."); }}
                          className="text-xs text-red-600 hover:underline">Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── 4. Privacy rules ────────────────────────────────── */}
      {o && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">4. Privacy rules</h2>
          <HelpBox title="Please review these with Town Counsel" variant="warning">
            <p>These rules decide what is hidden, anonymized, or held for review. The defaults are a conservative starting point — whether a category (for example, veterans’ benefits, salaries, or settlements) may be published is a legal question for your Town Counsel, not something this tool can decide. Changes apply to future uploads; use “Re-check held payments” to re-apply the name and memo rules to payments already on hold.</p>
          </HelpBox>
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
            <div>
              <label htmlFor="rules" className="block text-sm font-semibold text-gray-800">Sensitive account rules</label>
              <p className="text-xs text-gray-500 mb-2">One per line: <code>KEYWORD | action | label</code>. Matches the account description. Actions: <strong>exclude</strong> (never shown, only counted), <strong>redact</strong> (shown, but payee replaced by the label), <strong>hold</strong> (you review each one).</p>
              <textarea id="rules" value={rulesText} onChange={e => setRulesText(e.target.value)} rows={9} spellCheck={false}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" />
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="thr" className="block text-sm font-semibold text-gray-800">Hold large payments to individuals</label>
                <p className="text-xs text-gray-500 mb-2">Payments at or above this amount to someone marked “Individual” are held so a person can confirm they should be published.</p>
                <input id="thr" inputMode="numeric" value={threshold} onChange={e => setThreshold(e.target.value.replace(/[^0-9]/g, ""))} className="px-3 py-2 border border-gray-300 rounded-md text-sm w-40" />
              </div>
              <div>
                <p className="block text-sm font-semibold text-gray-800">Street addresses</p>
                <label className="flex items-start gap-2 mt-2 text-sm text-gray-700">
                  <input type="checkbox" checked={streets} onChange={e => setStreets(e.target.checked)} className="mt-1" />
                  <span>Remove house numbers from addresses in descriptions (e.g. “19 Reservoir Ave” → “Reservoir Ave”)</span>
                </label>
              </div>
            </div>
            <div>
              <label htmlFor="safe" className="block text-sm font-semibold text-gray-800">Safe phrases</label>
              <p className="text-xs text-gray-500 mb-2">Places or organizations that look like names (one per line), so they stop being flagged — e.g. a school or park named after a person.</p>
              <textarea id="safe" value={safePhrases} onChange={e => setSafePhrases(e.target.value)} rows={3} spellCheck={false}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div className="flex flex-wrap gap-3">
              <button disabled={busy === "settings"} onClick={() => act("settings", { action: "saveSettings", rulesText, largeIndividualThreshold: Number(threshold || 0), redactStreetNumbers: streets, safePhrasesText: safePhrases }, "Privacy rules saved.")}
                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50">{busy === "settings" ? "Saving…" : "Save rules"}</button>
              <button disabled={busy === "recheck"} onClick={async () => { const r = await act("recheck", { action: "recheckHeld" }); if (r) setNotice(`Re-checked ${r.checked} held payment${r.checked === 1 ? "" : "s"}; ${r.released} now published.`); }}
                className="px-4 py-2 border border-gray-300 bg-white rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50">{busy === "recheck" ? "Checking…" : "Re-check held payments"}</button>
              <button disabled={busy === "codes"} onClick={async () => { const r = await act("codes", { action: "reapplyAccountCodes" }); if (r) setNotice(`Re-applied Account Codes to ${r.checked} payment${r.checked === 1 ? "" : "s"}; ${r.updated} changed.`); }}
                className="px-4 py-2 border border-gray-300 bg-white rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50">{busy === "codes" ? "Applying…" : "Re-apply Account Codes"}</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${warn ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 tabular-nums">{sub}</p>}
    </div>
  );
}

function TabBtn({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
      {children}{count > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">{count}</span>}
    </button>
  );
}

function Btn({ children, onClick, busy, primary, danger }: { children: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean; danger?: boolean }) {
  const cls = primary ? "bg-gray-900 text-white hover:bg-gray-800 border-gray-900"
    : danger ? "bg-white text-red-600 border-red-200 hover:bg-red-50"
    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50";
  return <button onClick={onClick} disabled={busy} className={`px-3 py-1.5 rounded-md text-sm font-medium border disabled:opacity-50 ${cls}`}>{children}</button>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-8 text-center">{children}</p>;
}

function ReportCard({ report, publishing, onPublish, onCancel }: { report: UploadReport; publishing: boolean; onPublish: () => void; onCancel: () => void }) {
  const c = report.counts;
  const nothing = c.new === 0 && c.changed === 0;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-gray-900">{report.fileName}</h3>
        <p className="text-xs text-gray-500">{report.totalRows.toLocaleString()} rows · FY{report.fiscalYears.join(", FY")}</p>
      </div>

      {report.alreadyUploaded && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          This exact file was already uploaded on {fmtDateTime(report.alreadyUploaded.createdAt)} (as “{report.alreadyUploaded.fileName}”). Re-publishing it won’t add anything.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="New payments" value={c.new.toLocaleString()} sub={money(report.newAmount)} />
        <Stat label="Already loaded (skipped)" value={c.duplicate.toLocaleString()} />
        <Stat label="Will be updated" value={c.changed.toLocaleString()} warn={c.changed > 0} />
        <Stat label="Held for your review" value={c.held.toLocaleString()} warn={c.held > 0} />
      </div>

      <div className="text-sm text-gray-700 space-y-1">
        <p><strong>{c.published.toLocaleString()}</strong> would be published right away{c.excluded > 0 && <>, <strong>{c.excluded}</strong> withheld as confidential</>}{c.held > 0 && <>, and <strong>{c.held}</strong> held:</>}</p>
        {report.holdReasons.length > 0 && <ul className="list-disc pl-5 text-gray-600">{report.holdReasons.map(h => <li key={h.reason}>{h.count} — {h.label}</li>)}</ul>}
        {report.newVendors.total > 0 && <p className="text-gray-600">{report.newVendors.total} new vendor{report.newVendors.total === 1 ? "" : "s"}: {report.newVendors.autoApproved} recognized as organizations, {report.newVendors.needReview} need your review.</p>}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Warrant cycles in this file</p>
        <div className="overflow-x-auto"><table className="text-sm w-full max-w-xl">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-4">Warrant</th><th className="py-1 pr-4 text-right">Rows</th><th className="py-1 pr-4 text-right">New</th><th className="py-1 text-right">Amount</th></tr></thead>
          <tbody>{report.warrants.map(w => (
            <tr key={`${w.fiscalYear}-${w.warrant}`} className="border-t border-gray-100">
              <td className="py-1 pr-4">{w.warrant}</td><td className="py-1 pr-4 text-right tabular-nums">{w.rows}</td>
              <td className="py-1 pr-4 text-right tabular-nums">{w.newRows}</td><td className="py-1 text-right tabular-nums">{money(w.amount)}</td>
            </tr>))}</tbody>
        </table></div>
      </div>

      {report.possibleDuplicates.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">{c.flagged} possible duplicate payment{c.flagged === 1 ? "" : "s"} (they’ll still be published; review them afterwards)</p>
          <ul className="list-disc pl-5 mt-1 text-amber-800">{report.possibleDuplicates.slice(0, 5).map((d, i) => <li key={i}>{d.vendor} · {money(d.amount)} · {d.note}</li>)}</ul>
        </div>
      )}
      {report.changed.length > 0 && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
          <p className="font-semibold">{c.changed} existing payment{c.changed === 1 ? "" : "s"} changed in the ERP since they were loaded</p>
          <ul className="list-disc pl-5 mt-1">{report.changed.slice(0, 5).map((d, i) => <li key={i}>{d.vendor} · {money(d.amount)}</li>)}</ul>
        </div>
      )}
      {(report.skipped.unpaid > 0 || report.skipped.zeroAmount > 0 || report.skipped.invalid.length > 0) && (
        <p className="text-xs text-gray-500">Skipped: {report.skipped.unpaid} unpaid, {report.skipped.zeroAmount} zero-amount{report.skipped.invalid.length > 0 && `, ${report.skipped.invalid.length} unreadable row${report.skipped.invalid.length === 1 ? "" : "s"} (first: row ${report.skipped.invalid[0].row} – ${report.skipped.invalid[0].reason})`}.</p>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={onPublish} disabled={publishing || nothing}
          className="px-5 py-2 bg-emerald-700 text-white rounded-md text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">
          {publishing ? "Publishing…" : nothing ? "Nothing new to publish" : `Publish ${c.new.toLocaleString()} new payment${c.new === 1 ? "" : "s"}`}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}
