"use client";

import { useCallback, useEffect, useState } from "react";
import HelpBox from "@/components/admin/HelpBox";

interface Status {
  config: { configured: boolean; from: string; domain: string | null; replyTo: string | null; usingDefaultSender: boolean; appUrl: string; appUrlFromEnv: boolean };
  last30Days: Record<string, number>;
  log: { id: string; kind: string; toAddress: string; subject: string; status: string; error: string | null; createdAt: string }[];
  adminEmail: string;
}

const KIND: Record<string, string> = {
  invite: "Staff invitation", password_reset: "Password reset", welcome: "Welcome", verify: "Email verification", test: "Test",
  capital_submitted: "Request submitted (to admin)", capital_confirmation: "Request received (to department)", capital_decision: "Funding decision",
  capital_change_request: "Change request", capital_assigned: "Added to department", capital_call: "Call for projects", capital_reminder: "Reminder",
};

export default function AdminEmailPage() {
  const [s, setS] = useState<Status | null>(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/email");
    if (res.ok) setS(await res.json()); else setErr("Could not load email status.");
  }, []);
  useEffect(() => { load(); }, [load]);

  async function sendTest() {
    setBusy(true); setMsg(""); setErr("");
    try {
      const r = await (await fetch("/api/admin/email", { method: "POST" })).json();
      if (r.ok) setMsg(`Test email sent to ${r.to}. Check your inbox (and spam folder the first time).`);
      else setErr(`The test email didn't go out: ${r.error}`);
      await load();
    } catch { setErr("The test email didn't go out."); } finally { setBusy(false); }
  }

  if (!s) return <p className="text-gray-500 py-10 text-center">{err || "Loading…"}</p>;
  const c = s.config;
  const Row = ({ ok, label, detail }: { ok: boolean; label: string; detail: string }) => (
    <li className="flex gap-3 py-2"><span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`} aria-hidden="true">{ok ? "✓" : "!"}</span>
      <div><p className="text-sm font-medium text-gray-900">{label}</p><p className="text-xs text-gray-500">{detail}</p></div></li>
  );
  return (
    <div className="space-y-8 max-w-4xl">
      <div><h1 className="text-2xl font-semibold tracking-tight">Email</h1><p className="text-gray-500 mt-1 text-sm">OpenBook sends staff invitations, password resets, and capital-process notices through Resend.</p></div>
      {msg && <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}
      {err && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Setup checklist</h2>
        <ul className="divide-y divide-gray-100">
          <Row ok={c.configured} label="Resend API key" detail={c.configured ? "RESEND_API_KEY is set." : "Add RESEND_API_KEY in your Railway variables, then redeploy."} />
          <Row ok={!!c.domain && c.domain.endsWith("suttonma.gov")} label={`Sending from ${c.from}`} detail={c.usingDefaultSender ? "Using the default sender. To change it, set EMAIL_FROM, e.g. Sutton OpenBook <openbook@suttonma.gov>. The domain must be verified in Resend." : "Set by EMAIL_FROM. The domain must be verified in Resend."} />
          <Row ok={c.appUrlFromEnv} label={`Links point to ${c.appUrl}`} detail={c.appUrlFromEnv ? "Set by NEXT_PUBLIC_APP_URL." : "Set NEXT_PUBLIC_APP_URL to your site's public address so links in emails are always correct."} />
          <Row ok={!!c.replyTo} label={c.replyTo ? `Replies go to ${c.replyTo}` : "Replies have no destination"} detail="Optional. Set EMAIL_REPLY_TO (for example the Town Manager's office) so replies reach a real person." />
        </ul>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button onClick={sendTest} disabled={busy || !c.configured} className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50">{busy ? "Sending…" : `Send a test email to ${s.adminEmail}`}</button>
          <span className="text-xs text-gray-500">Last 30 days: {s.last30Days.sent ?? 0} sent · {s.last30Days.failed ?? 0} failed · {s.last30Days.skipped ?? 0} skipped</span>
        </div>
      </section>

      <HelpBox variant="info" title="If emails fail">
        <p>The most common cause is the sending domain not being verified in Resend. In Resend, open <strong>Domains</strong>, confirm {c.domain ?? "your domain"} shows as <strong>Verified</strong> (DNS records added), then try the test again. The reason Resend gives appears in the log below.</p>
      </HelpBox>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-900">Recent email</h2>
        {s.log.length === 0 ? <p className="text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-xl px-4 py-8 text-center">Nothing has been sent yet.</p> : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100"><th className="px-4 py-2">When</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">To</th><th className="px-2 py-2">Result</th></tr></thead>
              <tbody>{s.log.map(l => (
                <tr key={l.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-600">{new Date(l.createdAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-2 py-2">{KIND[l.kind] ?? l.kind}<p className="text-xs text-gray-400">{l.subject}</p></td>
                  <td className="px-2 py-2 text-gray-600 break-all">{l.toAddress}</td>
                  <td className="px-2 py-2"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${l.status === "sent" ? "bg-emerald-50 text-emerald-800" : l.status === "failed" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"}`}>{l.status}</span>{l.error && <p className="text-xs text-red-600 mt-1">{l.error}</p>}</td>
                </tr>))}</tbody></table>
          </div>
        )}
      </section>
    </div>
  );
}
