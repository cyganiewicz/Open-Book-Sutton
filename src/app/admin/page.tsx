export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { emailConfig } from "@/lib/email";
import { parseCapitalSettings, planYears, submissionsOpenNow } from "@/lib/capital/constants";

const ago = (d: Date | null | undefined) => {
  if (!d) return "never";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

export default async function AdminHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  const town = await prisma.town.findFirst();
  if (!town) redirect("/admin/setup"); // first run only

  const week = new Date(Date.now() - 7 * 86400000);
  const [lastUpload, uploadCount, ckPublished, ckHeld, ckVendors, ckBatch, capGroups, capChange, staffCount, invites, failedEmails, adminDeptless] = await Promise.all([
    prisma.upload.findFirst({ where: { townId: town.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true, dataCategory: true } }),
    prisma.upload.count({ where: { townId: town.id } }),
    prisma.checkbookPayment.count({ where: { townId: town.id, status: "published" } }),
    prisma.checkbookPayment.count({ where: { townId: town.id, status: "held" } }),
    prisma.checkbookVendor.count({ where: { townId: town.id, kind: "review" } }),
    prisma.checkbookBatch.findFirst({ where: { townId: town.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.capitalProject.groupBy({ by: ["requestStatus"], where: { townId: town.id }, _count: true }),
    prisma.capitalComment.count({ where: { kind: "change_request", resolved: false, project: { townId: town.id } } }),
    prisma.staffUser.count({ where: { townId: town.id } }),
    prisma.staffInvite.count({ where: { townId: town.id, used: false } }),
    prisma.emailLog.count({ where: { status: "failed", createdAt: { gte: week } } }),
    prisma.capitalDepartment.count({ where: { townId: town.id, members: { none: {} } } }),
  ]);

  const cap = Object.fromEntries(capGroups.map(g => [g.requestStatus, g._count])) as Record<string, number>;
  const capTotal = capGroups.reduce((s, g) => s + g._count, 0);
  const settings = parseCapitalSettings(town.capitalSettings);
  const years = planYears(settings);
  const open = submissionsOpenNow(settings);
  const awaiting = (cap.submitted ?? 0) + (cap.under_review ?? 0);
  const email = emailConfig();

  const todo: { href: string; text: string; tone: "amber" | "blue" }[] = [];
  if (!email.configured) todo.push({ href: "/admin/email", text: "Email isn't set up yet, so invitations and notices can't be sent.", tone: "amber" });
  if (failedEmails > 0) todo.push({ href: "/admin/email", text: `${failedEmails} email${failedEmails === 1 ? "" : "s"} failed to send in the last 7 days.`, tone: "amber" });
  if (capChange > 0) todo.push({ href: "/admin/capital", text: `${capChange} change request${capChange === 1 ? "" : "s"} from departments on funded projects.`, tone: "blue" });
  if (awaiting > 0) todo.push({ href: "/admin/capital", text: `${awaiting} capital request${awaiting === 1 ? "" : "s"} awaiting your review.`, tone: "blue" });
  if (ckVendors > 0) todo.push({ href: "/admin/checkbook", text: `${ckVendors} checkbook vendor${ckVendors === 1 ? "" : "s"} need to be classified.`, tone: "amber" });
  if (ckHeld > 0) todo.push({ href: "/admin/checkbook", text: `${ckHeld} checkbook payment${ckHeld === 1 ? " is" : "s are"} on hold for review.`, tone: "amber" });
  if (adminDeptless > 0 && capTotal > 0) todo.push({ href: "/admin/capital", text: `${adminDeptless} capital department${adminDeptless === 1 ? " has" : "s have"} no department head assigned yet.`, tone: "blue" });
  if (invites > 0) todo.push({ href: "/admin/users", text: `${invites} staff invitation${invites === 1 ? "" : "s"} not yet accepted.`, tone: "blue" });

  const Card = ({ href, title, lines, cta }: { href: string; title: string; lines: string[]; cta: string }) => (
    <Link href={href} className="block bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition-all">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      <ul className="mt-2 space-y-1 text-sm text-gray-600">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p className="mt-3 text-sm font-medium text-blue-600">{cta} →</p>
    </Link>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
        <p className="text-gray-500 mt-1 text-sm">{town.name} · what’s happening across OpenBook.</p>
      </div>

      <section aria-labelledby="todo-h">
        <h2 id="todo-h" className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-2">Needs your attention</h2>
        {todo.length === 0 ? (
          <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">You’re all caught up. Nothing is waiting on you.</p>
        ) : (
          <ul className="space-y-2">{todo.map((t, i) => (
            <li key={i}><Link href={t.href} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm hover:shadow-sm ${t.tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-blue-50 border-blue-200 text-blue-900"}`}><span>{t.text}</span><span aria-hidden="true">→</span></Link></li>
          ))}</ul>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <Card href="/admin/capital" title="Capital Improvement Program" cta="Open capital"
          lines={[`FY${years[0]}–FY${years[years.length - 1]} cycle · FY${settings.adoptedFY} adopted`, `${capTotal} projects: ${cap.approved ?? 0} funded, ${awaiting} awaiting review, ${cap.draft ?? 0} drafts`, open ? `Departments can edit${settings.submissionDeadline ? ` until ${new Date(settings.submissionDeadline.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { dateStyle: "medium" })}` : ""}` : "Editing is closed to departments"]} />
        <Card href="/admin/checkbook" title="Open Checkbook" cta="Open checkbook"
          lines={[`${ckPublished.toLocaleString()} payments published`, `Last upload: ${ago(ckBatch?.createdAt)}`, ckHeld + ckVendors > 0 ? `${ckVendors} vendors and ${ckHeld} payments need review` : "Nothing waiting for review"]} />
        <Card href="/admin/upload" title="Budget data" cta="Upload or review data"
          lines={[`${uploadCount} uploads`, lastUpload ? `Last upload: ${ago(lastUpload.createdAt)} (${lastUpload.dataCategory})` : "No uploads yet"]} />
        <Card href="/admin/users" title="People and email" cta="Manage users"
          lines={[`${staffCount} staff account${staffCount === 1 ? "" : "s"}, ${invites} pending invitation${invites === 1 ? "" : "s"}`, email.configured ? `Email sends from ${email.from.replace(/.*<|>.*/g, "")}` : "Email is not set up yet"]} />
      </div>

      <p className="text-sm text-gray-500">
        Looking for something else? <Link href="/admin/setup" className="text-blue-600 hover:underline">Site settings</Link> · <a href={`/${town.slug}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View the public site ↗</a>
      </p>
    </div>
  );
}
