import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword } from "@/lib/staff-auth";
import { sendWelcomeEmail } from "@/lib/email";

export async function GET() {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const town = await prisma.town.findFirst();
  if (!town) {
    return NextResponse.json({ error: "No town configured" }, { status: 404 });
  }

  const users = await prisma.staffUser.findMany({
    where: { townId: town.id },
    select: {
      id: true,
      email: true,
      name: true,
      department: true,
      emailVerified: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { email, name, department, password } = body;

  if (!email || !name || !password) {
    return NextResponse.json(
      { error: "Email, name, and password are required" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }

  const town = await prisma.town.findFirst();
  if (!town) {
    return NextResponse.json({ error: "No town configured" }, { status: 404 });
  }

  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  const verificationToken = randomUUID();
  const user = await prisma.staffUser.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      name,
      department: department || null,
      townId: town.id,
      verificationToken,
      emailVerified: true,
    },
  });

  await sendWelcomeEmail(email, name, town.name, password);

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    department: user.department,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  });
}
