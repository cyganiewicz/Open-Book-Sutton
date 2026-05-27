import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  hashPassword,
  createStaffSession,
  setStaffSessionCookie,
} from "@/lib/staff-auth";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, department, townSlug } = body;

    if (!email || !password || !name || !townSlug) {
      return NextResponse.json(
        { error: "Email, password, name, and town slug are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Look up town by slug
    const town = await prisma.town.findUnique({ where: { slug: townSlug } });
    if (!town) {
      return NextResponse.json(
        { error: "Town not found" },
        { status: 404 }
      );
    }

    const emailDomain = email.split("@")[1]?.toLowerCase();
    if (!emailDomain) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const allowedDomains = town.allowedDomains
      ? town.allowedDomains.split(",").map((d: string) => d.trim().toLowerCase()).filter(Boolean)
      : [];

    if (allowedDomains.length > 0) {
      if (!allowedDomains.includes(emailDomain)) {
        return NextResponse.json(
          { error: `Staff accounts must use one of these email domains: ${allowedDomains.map((d: string) => "@" + d).join(", ")}` },
          { status: 400 }
        );
      }
    } else {
      if (!emailDomain.endsWith(".gov")) {
        return NextResponse.json(
          { error: "Staff accounts require a .gov email address" },
          { status: 400 }
        );
      }
    }

    // Check if email is already registered
    const existing = await prisma.staffUser.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Create staff user with verification token
    const verificationToken = randomUUID();
    const passwordHash = hashPassword(password);
    const user = await prisma.staffUser.create({
      data: {
        email,
        passwordHash,
        name,
        department: department || null,
        townId: town.id,
        verificationToken,
      },
    });

    // Create session and set cookie
    const token = await createStaffSession(user.id);
    await setStaffSessionCookie(token);

    await sendVerificationEmail(email, name, verificationToken);

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      townId: user.townId,
      verificationToken,
    });
  } catch (error) {
    console.error("Staff registration error:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
