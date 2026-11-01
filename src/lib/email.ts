// Outgoing email through Resend.
//
// Configuration (Railway variables):
//   RESEND_API_KEY      required – your Resend API key
//   EMAIL_FROM          e.g.  Sutton OpenBook <openbook@suttonma.gov>   (must be on a domain verified in Resend)
//   EMAIL_REPLY_TO      optional – where replies go (e.g. the Town Manager's office)
//   NEXT_PUBLIC_APP_URL the public address of this site, used for links in emails
//
// Sending never throws: a failed email must not break the action that triggered it.
// Every attempt is recorded in the EmailLog table so problems are visible in Admin → Email.

import { prisma } from "@/lib/db";

export function emailConfig() {
  const from = process.env.EMAIL_FROM || "OpenBook <openbook@suttonma.gov>";
  return {
    configured: !!process.env.RESEND_API_KEY,
    from,
    domain: from.match(/@([^>\s]+)/)?.[1] ?? null,
    replyTo: process.env.EMAIL_REPLY_TO || null,
    usingDefaultSender: !process.env.EMAIL_FROM,
  };
}

/**
 * Public base address for links in emails, in order of trust:
 *   1. APP_URL (runtime) or NEXT_PUBLIC_APP_URL, e.g. https://finance.suttonma.gov
 *   2. the public host the visitor used, from the proxy's forwarded headers
 *   3. the request's own address (only correct when there is no proxy)
 * Bracket access keeps these read at runtime rather than frozen in at build time.
 */
export async function appBaseUrl(request?: Request): Promise<string> {
  const env = process.env["APP_URL"] || process.env["NEXT_PUBLIC_APP_URL"];
  if (env) return env.replace(/\/+$/, "");
  const fromHeaders = (get: (k: string) => string | null) => {
    const host = (get("x-forwarded-host") || get("host") || "").split(",")[0].trim();
    if (!host) return null;
    const proto = (get("x-forwarded-proto") || (/^(localhost|127\.)/.test(host) ? "http" : "https")).split(",")[0].trim();
    return `${proto}://${host}`;
  };
  try {
    if (request) return fromHeaders(k => request.headers.get(k)) ?? new URL(request.url).origin;
    const { headers } = await import("next/headers");
    const h = await headers();
    const u = fromHeaders(k => h.get(k));
    if (u) return u;
  } catch { /* not inside a request */ }
  return "http://localhost:3000";
}

export const isLocalAddress = (url: string) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/.test(url);

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface SendOptions {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  kind: string;
  townId?: string | null;
  replyTo?: string | null;
}
export interface SendResult { ok: boolean; status: "sent" | "failed" | "skipped"; error?: string; id?: string }

async function record(o: SendOptions, to: string[], status: SendResult["status"], error?: string) {
  try {
    await prisma.emailLog.create({
      data: { townId: o.townId ?? null, kind: o.kind, toAddress: to.join(", ").slice(0, 500), subject: o.subject.slice(0, 200), status, error: error ? error.slice(0, 500) : null },
    });
  } catch (e) { console.error("EmailLog write failed:", e); }
}

export async function sendEmail(o: SendOptions): Promise<SendResult> {
  const to = (Array.isArray(o.to) ? o.to : [o.to]).map(t => t.trim()).filter(t => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t));
  if (to.length === 0) return { ok: false, status: "skipped", error: "No valid recipient address." };

  const cfg = emailConfig();
  if (!cfg.configured) {
    console.log(`[email not configured] ${o.kind} → ${to.join(", ")}: ${o.subject}`);
    await record(o, to, "skipped", "Email isn't set up yet (RESEND_API_KEY is missing).");
    return { ok: false, status: "skipped", error: "Email isn't set up yet (RESEND_API_KEY is missing)." };
  }
  try {
    const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to, subject: o.subject, html: o.html, text: o.text, ...((o.replyTo || cfg.replyTo) ? { reply_to: o.replyTo || cfg.replyTo } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      const err = body.message || `Resend responded with status ${res.status}.`;
      await record(o, to, "failed", err);
      return { ok: false, status: "failed", error: err };
    }
    await record(o, to, "sent");
    return { ok: true, status: "sent", id: body.id };
  } catch (e) {
    const err = e instanceof Error ? e.message : "Could not reach Resend.";
    await record(o, to, "failed", err);
    return { ok: false, status: "failed", error: err };
  }
}

// ── Template ─────────────────────────────────────────────────────────────────

export function renderEmail(o: {
  townName: string; color?: string; heading: string; paragraphs: string[];
  details?: { label: string; value: string }[]; button?: { label: string; url: string }; footer?: string;
}): { html: string; text: string } {
  const color = /^#[0-9a-fA-F]{6}$/.test(o.color ?? "") ? (o.color as string) : "#2d6a4f";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="background:${color};color:#ffffff;padding:16px 24px;font-size:14px;font-weight:600;letter-spacing:.02em;">${escapeHtml(o.townName)} · OpenBook</td></tr>
<tr><td style="padding:28px 24px 8px 24px;"><h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;">${escapeHtml(o.heading)}</h1>
${o.paragraphs.map(p => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;">${escapeHtml(p)}</p>`).join("")}
${o.details?.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;width:100%;border-collapse:collapse;">${o.details.map(d => `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280;vertical-align:top;white-space:nowrap;">${escapeHtml(d.label)}</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${escapeHtml(d.value)}</td></tr>`).join("")}</table>` : ""}
${o.button ? `<p style="margin:20px 0;"><a href="${escapeHtml(o.button.url)}" style="background:${color};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">${escapeHtml(o.button.label)}</a></p><p style="margin:0 0 14px 0;font-size:12px;color:#6b7280;word-break:break-all;">If the button doesn't work, copy this link: ${escapeHtml(o.button.url)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 24px 24px 24px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;">${escapeHtml(o.footer ?? "You're receiving this because of your role with the Town's capital planning and budget transparency tools.")}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.heading, "", ...o.paragraphs, ...(o.details?.length ? ["", ...o.details.map(d => `${d.label}: ${d.value}`)] : []), ...(o.button ? ["", `${o.button.label}: ${o.button.url}`] : []), "", o.footer ?? ""].join("\n").trim();
  return { html, text };
}

async function townInfo(townId?: string | null) {
  const t = townId ? await prisma.town.findUnique({ where: { id: townId }, select: { name: true, primaryColor: true } })
    : await prisma.town.findFirst({ select: { name: true, primaryColor: true } });
  return { name: t?.name ?? "Your Town", color: t?.primaryColor ?? undefined };
}

// ── Messages used by user administration ─────────────────────────────────────

export async function sendInviteEmail(opts: { to: string; joinUrl: string; townId?: string | null; invitedBy?: string }) {
  const t = await townInfo(opts.townId);
  const { html, text } = renderEmail({
    townName: t.name, color: t.color, heading: `You're invited to ${t.name}'s staff portal`,
    paragraphs: [
      `${opts.invitedBy ? `${opts.invitedBy} has` : "An administrator has"} invited you to OpenBook, where department heads submit and track capital project requests.`,
      "Use the button below to create your account. The link is just for you, so please don't forward it.",
    ],
    button: { label: "Create my account", url: opts.joinUrl },
  });
  return sendEmail({ to: opts.to, subject: `You're invited to the ${t.name} OpenBook staff portal`, html, text, kind: "invite", townId: opts.townId });
}

export async function sendPasswordResetEmail(opts: { to: string; name: string; resetUrl: string; townId?: string | null }) {
  const t = await townInfo(opts.townId);
  const { html, text } = renderEmail({
    townName: t.name, color: t.color, heading: "Set a new password",
    paragraphs: [`Hello ${opts.name}, an administrator has set up a password reset for your OpenBook staff account.`, "Use the button below to choose a new password. If you weren't expecting this, you can ignore the email."],
    button: { label: "Choose a new password", url: opts.resetUrl },
  });
  return sendEmail({ to: opts.to, subject: "Reset your OpenBook password", html, text, kind: "password_reset", townId: opts.townId });
}

/** Existing callers: email verification after self-registration */
export async function sendVerificationEmail(to: string, name: string, token: string) {
  const url = `${await appBaseUrl()}/verify?token=${token}`;
  const t = await townInfo();
  const { html, text } = renderEmail({
    townName: t.name, color: t.color, heading: `Welcome to OpenBook, ${name}`,
    paragraphs: ["Please verify your email address to activate your account."], button: { label: "Verify my email", url: url },
  });
  return sendEmail({ to, subject: "Verify your OpenBook account", html, text, kind: "verify" });
}

/** Existing caller: an administrator created the account directly. We never email a password. */
export async function sendWelcomeEmail(to: string, name: string, townName: string, setPasswordUrl: string, townId?: string | null) {
  const t = await townInfo(townId);
  const { html, text } = renderEmail({
    townName: townName || t.name, color: t.color, heading: `Welcome to OpenBook, ${name}`,
    paragraphs: [`An administrator for ${townName || t.name} has created a staff account for you.`, "Use the button below to choose your own password and sign in."],
    button: { label: "Set my password", url: setPasswordUrl },
  });
  return sendEmail({ to, subject: `Your OpenBook account for ${townName || t.name}`, html, text, kind: "welcome", townId });
}
