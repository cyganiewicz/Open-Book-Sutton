import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  createStaffSession,
  setStaffSessionCookie,
} from "@/lib/staff-auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const invite = await prisma.staffInvite.findUnique({ where: { token } });
  if (!invite) {
    return NextResponse.json({ error: "This invite link is not valid." }, { status: 404 });
  }

  if (invite.used) {
    return NextResponse.json({ error: "This invite has already been used." }, { status: 410 });
  }

  const town = await prisma.town.findUnique({ where: { id: invite.townId } });

  return NextResponse.json({
    email: invite.email,
    townName: town?.name || "Unknown",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, name, password, department } = body;

    if (!token || !name || !password) {
      return NextResponse.json(
        { error: "Token, name, and password are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const invite = await prisma.staffInvite.findUnique({ where: { token } });
    if (!invite) {
      return NextResponse.json({ error: "Invalid invite token" }, { status: 404 });
    }

    if (invite.used) {
      return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
    }

    const existing = await prisma.staffUser.findUnique({ where: { email: invite.email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const user = await prisma.staffUser.create({
      data: {
        email: invite.email,
        passwordHash: hashPassword(password),
        name,
        department: department || null,
        townId: invite.townId,
        emailVerified: true,
      },
    });

    await prisma.staffInvite.update({
      where: { id: invite.id },
      data: { used: true },
    });

    const sessionToken = await createStaffSession(user.id);
    await setStaffSessionCookie(sessionToken);

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  } catch (error) {
    console.error("Join error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
