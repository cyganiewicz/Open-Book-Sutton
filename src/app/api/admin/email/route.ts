import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { appBaseUrl, emailConfig, isLocalAddress, renderEmail, sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [log, counts] = await Promise.all([
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.emailLog.groupBy({ by: ["status"], _count: true, where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
  ]);
  const cfg = emailConfig();
  return NextResponse.json({
    config: { ...cfg, appUrl: await appBaseUrl(request), appUrlFromEnv: !!(process.env["APP_URL"] || process.env["NEXT_PUBLIC_APP_URL"]), appUrlIsLocal: isLocalAddress(await appBaseUrl(request)) },
    last30Days: Object.fromEntries(counts.map(c => [c.status, c._count])),
    log: log.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
    adminEmail: admin.email,
  });
}

// Sends a test message to the signed-in administrator
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const town = await prisma.town.findFirst({ select: { id: true, name: true, primaryColor: true } });
  const { html, text } = renderEmail({
    townName: town?.name ?? "OpenBook", color: town?.primaryColor ?? undefined, heading: "Your OpenBook email is working",
    paragraphs: ["This is a test message. If you're reading it, OpenBook can send email from your Town's domain."],
    button: { label: "Open OpenBook admin", url: `${await appBaseUrl(request)}/admin` },
  });
  const r = await sendEmail({ to: admin.email, subject: "OpenBook test email", html, text, kind: "test", townId: town?.id });
  return NextResponse.json({ ok: r.ok, status: r.status, error: r.error ?? null, to: admin.email });
}
