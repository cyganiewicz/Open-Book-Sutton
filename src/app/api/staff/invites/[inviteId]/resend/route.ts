import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { appBaseUrl, sendInviteEmail } from "@/lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ inviteId: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { inviteId } = await params;
  const invite = await prisma.staffInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.used) return NextResponse.json({ error: "That invite is no longer pending." }, { status: 404 });
  const joinUrl = `${await appBaseUrl(request)}/staff/join?token=${invite.token}`;
  const sent = await sendInviteEmail({ to: invite.email, joinUrl, townId: invite.townId, invitedBy: admin.name || undefined });
  return NextResponse.json({ emailed: sent.ok, emailError: sent.ok ? null : sent.error ?? "The email could not be sent.", email: invite.email });
}
