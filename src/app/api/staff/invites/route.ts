import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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

  const existingInvite = await prisma.staffInvite.findFirst({
    where: { email, townId: town.id, used: false },
  });
  if (existingInvite) {
    return NextResponse.json({
      id: existingInvite.id,
      email: existingInvite.email,
      token: existingInvite.token,
      used: existingInvite.used,
      createdAt: existingInvite.createdAt,
    });
  }

  const invite = await prisma.staffInvite.create({
    data: {
      townId: town.id,
      email,
      token: randomUUID(),
    },
  });

  return NextResponse.json({
    id: invite.id,
    email: invite.email,
    token: invite.token,
    used: invite.used,
    createdAt: invite.createdAt,
  });
}
