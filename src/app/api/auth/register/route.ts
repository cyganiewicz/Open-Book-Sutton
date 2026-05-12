import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie, getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const { email, password, name } = body;

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "All fields are required" },
      { status: 400 }
    );
  }

  const adminCount = await prisma.adminUser.count();

  if (adminCount > 0) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json(
        { error: "Registration is closed. An existing admin must create new accounts." },
        { status: 403 }
      );
    }
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const user = await prisma.adminUser.create({
    data: {
      email,
      passwordHash: hashPassword(password),
      name,
    },
  });

  if (adminCount === 0) {
    const token = await createSession(user.id);
    await setSessionCookie(token);
  }

  return NextResponse.json(
    { id: user.id, email: user.email, name: user.name },
    { status: 201 }
  );
}
