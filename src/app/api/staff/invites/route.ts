import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { appBaseUrl, sendInviteEmail } from "@/lib/email";

export async function GET() {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const town = await prisma.town.findFirst();
  if (!town) {
    return NextResponse.json({ error: "No town configured" }, { status: 404 });
  }

  const invites = await prisma.staffInvite.findMany({
    where: { townId: town.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invites);
}

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const town = await prisma.town.findFirst();
  if (!town) {
    return NextResponse.json({ error: "No town configured" }, { status: 404 });
  }

  if (town.allowedDomains) {
    const allowedDomains = town.allowedDomains.split(",").map((d: string) => d.trim().toLowerCase()).filter(Boolean);
    if (allowedDomains.length > 0) {
      const emailDomain = email.split("@")[1]?.toLowerCase();
      if (!allowedDomains.includes(emailDomain)) {
        return NextResponse.json(
          { error: `Only these email domains are allowed: ${allowedDomains.map((d: string) => "@" + d).join(", ")}` },
          { status: 400 }
        );
      }
    }
  }

  const existingUser = await prisma.staffUser.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  let invite = await prisma.staffInvite.findFirst({
    where: { email, townId: town.id, used: false },
  });
  if (!invite) {
    invite = await prisma.staffInvite.create({
      data: {
        townId: town.id,
        email,
        token: randomUUID(),
      },
    });
  }

  // Email the link so the administrator never has to copy and paste it
  const joinUrl = `${await appBaseUrl(request)}/staff/join?token=${invite.token}`;
  const sent = await sendInviteEmail({ to: invite.email, joinUrl, townId: town.id, invitedBy: admin.name || undefined });

  return NextResponse.json({
    id: invite.id,
    email: invite.email,
    token: invite.token,
    used: invite.used,
    createdAt: invite.createdAt,
    emailed: sent.ok,
    emailError: sent.ok ? null : sent.error ?? "The email could not be sent.",
  });
}
