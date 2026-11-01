// Emails sent during the capital process. Everything here is "best effort": a failure to send
// is logged (Admin → Email) but never blocks the action that caused it.

import { prisma } from "@/lib/db";
import { appBaseUrl, renderEmail, sendEmail } from "@/lib/email";
import { fundingLabel, parseCapitalSettings, planYears, submissionsOpenNow } from "./constants";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

async function context(townId: string, base?: string) {
  const town = await prisma.town.findUnique({ where: { id: townId }, select: { name: true, primaryColor: true, capitalSettings: true } });
  const settings = parseCapitalSettings(town?.capitalSettings);
  return { townName: town?.name ?? "Your Town", color: town?.primaryColor ?? undefined, settings, base: base ?? await appBaseUrl() };
}

/** The Town Manager's office: CAPITAL_NOTIFY_EMAIL if set, otherwise every administrator account */
async function adminRecipients(): Promise<string[]> {
  const env = (process.env.CAPITAL_NOTIFY_EMAIL || "").split(",").map(s => s.trim()).filter(Boolean);
  if (env.length) return env;
  return (await prisma.adminUser.findMany({ select: { email: true } })).map(a => a.email);
}

async function departmentRecipients(departmentId: string): Promise<{ email: string; name: string }[]> {
  const ms = await prisma.capitalDepartmentMember.findMany({ where: { departmentId }, select: { staffUser: { select: { email: true, name: true } } } });
  return ms.map(m => m.staffUser);
}

/** Run an email task without making the caller wait or fail */
export function inBackground(task: Promise<unknown>) {
  task.catch(e => console.error("Capital notification failed:", e));
}

async function loadProject(projectId: string) {
  return prisma.capitalProject.findUnique({
    where: { id: projectId },
    select: { id: true, townId: true, code: true, title: true, priority: true, departmentId: true, department: { select: { name: true } }, years: { select: { fiscalYear: true, requestedAmount: true, approvedAmount: true, fundingSplit: true } } },
  });
}

export async function notifySubmitted(projectId: string, submitter: { name: string; email: string; kind: "admin" | "staff" }, resubmitted = false, base?: string) {
  const p = await loadProject(projectId); if (!p) return;
  const c = await context(p.townId, base); if (!c.settings.emailsEnabled) return;
  const total = p.years.reduce((s, y) => s + y.requestedAmount, 0);
  const yrs = p.years.filter(y => y.requestedAmount > 0).map(y => `FY${y.fiscalYear} ${money(y.requestedAmount)}`).join(", ");
  const details = [{ label: "Project", value: `${p.title} (${p.code})` }, { label: "Department", value: p.department.name }, { label: "Total requested", value: money(total) }, ...(yrs ? [{ label: "By year", value: yrs }] : [])];
  const verb = resubmitted ? "resubmitted" : "submitted";

  const admins = await adminRecipients();
  const a = renderEmail({ townName: c.townName, color: c.color, heading: `Capital request ${verb}: ${p.title}`, paragraphs: [`${submitter.name} (${p.department.name}) ${verb} a capital request.`], details, button: { label: "Review the request", url: `${c.base}/admin/capital/${p.id}` } });
  await sendEmail({ to: admins, subject: `Capital request ${verb}: ${p.title}`, html: a.html, text: a.text, kind: "capital_submitted", townId: p.townId });

  if (submitter.kind === "staff") {
    const s = renderEmail({ townName: c.townName, color: c.color, heading: "We received your capital request", paragraphs: [`Thank you, ${submitter.name}. Your request has been ${verb} to the Town Manager's office. You can keep refining supporting details until editing closes, and you'll get an email when a decision is made.`], details, button: { label: "Open your request", url: `${c.base}/staff/capital/${p.id}` } });
    await sendEmail({ to: submitter.email, subject: `Received: ${p.title}`, html: s.html, text: s.text, kind: "capital_confirmation", townId: p.townId });
  }
}

export async function notifyDecision(projectId: string, outcome: "funded" | "not_funded" | "recommended", info: { fiscalYear?: string; amount?: number } = {}, base?: string) {
  const p = await loadProject(projectId); if (!p) return;
  const c = await context(p.townId, base); if (!c.settings.emailsEnabled) return;
  const people = await departmentRecipients(p.departmentId); if (!people.length) return;
  const funded = info.fiscalYear ? p.years.find(y => y.fiscalYear === info.fiscalYear) : undefined;
  const split = funded ? Object.entries(JSON.parse(funded.fundingSplit || "{}") as Record<string, number>).map(([k, v]) => `${fundingLabel(k)} ${money(v)}`).join(", ") : "";
  const copy = {
    funded: { heading: `Funded: ${p.title}`, para: `Good news: this project was funded${info.fiscalYear ? ` in the FY${info.fiscalYear} capital budget` : ""}${info.amount ? ` for ${money(info.amount)}` : ""}. Approved details are now locked. You can post status updates and add photos as the work moves forward.` },
    not_funded: { heading: `Not funded this cycle: ${p.title}`, para: "This request wasn't funded this cycle. You can revise it and resubmit it for a later year." },
    recommended: { heading: `Recommended: ${p.title}`, para: "The Town Manager has recommended this request. It is now locked while the budget moves forward. Contact the Town Manager's office if something needs to change." },
  }[outcome];
  const e = renderEmail({ townName: c.townName, color: c.color, heading: copy.heading, paragraphs: [copy.para], details: [{ label: "Project", value: `${p.title} (${p.code})` }, ...(split ? [{ label: "Funding", value: split }] : [])], button: { label: "Open the project", url: `${c.base}/staff/capital/${p.id}` } });
  await sendEmail({ to: people.map(x => x.email), subject: copy.heading, html: e.html, text: e.text, kind: "capital_decision", townId: p.townId });
}

export async function notifyChangeRequest(projectId: string, authorName: string, body: string, base?: string) {
  const p = await loadProject(projectId); if (!p) return;
  const c = await context(p.townId, base); if (!c.settings.emailsEnabled) return;
  const e = renderEmail({ townName: c.townName, color: c.color, heading: `Change requested: ${p.title}`, paragraphs: [`${authorName} (${p.department.name}) asked for a change to a funded project:`, `“${body.slice(0, 600)}”`], button: { label: "Review the request", url: `${c.base}/admin/capital/${p.id}` } });
  await sendEmail({ to: await adminRecipients(), subject: `Change requested: ${p.title}`, html: e.html, text: e.text, kind: "capital_change_request", townId: p.townId });
}

export async function notifyAssigned(staffUserId: string, departmentName: string, base?: string) {
  const u = await prisma.staffUser.findUnique({ where: { id: staffUserId }, select: { email: true, name: true, townId: true } }); if (!u) return;
  const c = await context(u.townId, base); if (!c.settings.emailsEnabled) return;
  const e = renderEmail({ townName: c.townName, color: c.color, heading: `You can now manage ${departmentName}'s capital projects`, paragraphs: [`Hello ${u.name}, you've been added as a department contact for ${departmentName}. You can enter and update capital requests, post status updates on funded projects, and add photos and quotes.`], button: { label: "Open capital projects", url: `${c.base}/staff/capital` } });
  await sendEmail({ to: u.email, subject: `You've been added to ${departmentName} capital projects`, html: e.html, text: e.text, kind: "capital_assigned", townId: u.townId });
}

export interface BlastResult { recipients: number; sent: number; failed: number; skipped: number; error?: string }

async function blast(townId: string, people: { email: string; name: string }[], build: (name: string) => { subject: string; html: string; text: string }, kind: string): Promise<BlastResult> {
  const unique = [...new Map(people.map(p => [p.email.toLowerCase(), p])).values()];
  const r: BlastResult = { recipients: unique.length, sent: 0, failed: 0, skipped: 0 };
  for (const p of unique) {
    const m = build(p.name);
    const res = await sendEmail({ to: p.email, subject: m.subject, html: m.html, text: m.text, kind, townId });
    if (res.status === "sent") r.sent++; else if (res.status === "failed") { r.failed++; r.error = res.error; } else { r.skipped++; r.error = res.error; }
  }
  return r;
}

/** Admin-triggered: tell every department head the capital cycle is open */
export async function sendCallForProjects(townId: string, personalNote?: string): Promise<BlastResult> {
  const c = await context(townId);
  const years = planYears(c.settings);
  const people = (await prisma.capitalDepartmentMember.findMany({ where: { department: { townId } }, select: { staffUser: { select: { email: true, name: true } } } })).map(m => m.staffUser);
  const deadline = c.settings.submissionDeadline ? new Date(c.settings.submissionDeadline.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { dateStyle: "long" }) : null;
  const open = submissionsOpenNow(c.settings);
  return blast(townId, people, name => {
    const e = renderEmail({
      townName: c.townName, color: c.color, heading: `FY${years[0]}–FY${years[years.length - 1]} Capital Improvement Program`,
      paragraphs: [`Hello ${name},`, `We're updating the Town's six-year capital plan. Please review your department's existing requests, update costs and priorities, and add anything new. FY${c.settings.adoptedFY} is the adopted capital budget; requests are for FY${years[0]} and later.`, ...(personalNote?.trim() ? [personalNote.trim()] : []), ...(open ? [] : ["Note: editing is not open yet. You'll receive another email when it is."])],
      details: [...(deadline ? [{ label: "Please submit by", value: deadline }] : []), { label: "What to include", value: "Description, priority (1–5), costs by year, a recent quote, and a photo" }],
      button: { label: "Open my capital projects", url: `${c.base}/staff/capital` },
    });
    return { subject: `FY${years[0]}–${years[years.length - 1]} Capital Improvement Program is open`, html: e.html, text: e.text };
  }, "capital_call");
}

/** Admin-triggered: nudge people whose department has drafts or not-funded requests waiting on them */
export async function sendReminders(townId: string): Promise<BlastResult> {
  const c = await context(townId);
  const depts = await prisma.capitalDepartment.findMany({
    where: { townId, projects: { some: { requestStatus: { in: ["draft", "not_funded"] } } } },
    select: { id: true, name: true, projects: { where: { requestStatus: { in: ["draft", "not_funded"] } }, select: { title: true, requestStatus: true } } },
  });
  const per = new Map<string, { email: string; name: string; lines: string[] }>();
  for (const d of depts) for (const m of await departmentRecipients(d.id)) {
    const cur = per.get(m.email.toLowerCase()) ?? { ...m, lines: [] };
    cur.lines.push(...d.projects.map(p => `${p.title} (${p.requestStatus === "draft" ? "draft to finish" : "not funded: revise or resubmit"})`));
    per.set(m.email.toLowerCase(), cur);
  }
  const deadline = c.settings.submissionDeadline ? new Date(c.settings.submissionDeadline.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { dateStyle: "long" }) : null;
  const people = [...per.values()];
  const r: BlastResult = { recipients: people.length, sent: 0, failed: 0, skipped: 0 };
  for (const p of people) {
    const e = renderEmail({
      townName: c.townName, color: c.color, heading: "A few capital requests still need your attention",
      paragraphs: [`Hello ${p.name}, these are waiting on you${deadline ? ` (editing closes ${deadline})` : ""}:`, ...p.lines.slice(0, 15).map(l => `• ${l}`)],
      button: { label: "Open my capital projects", url: `${c.base}/staff/capital` },
    });
    const res = await sendEmail({ to: p.email, subject: "Reminder: capital requests need your attention", html: e.html, text: e.text, kind: "capital_reminder", townId });
    if (res.status === "sent") r.sent++; else if (res.status === "failed") { r.failed++; r.error = res.error; } else { r.skipped++; r.error = res.error; }
  }
  return r;
}
