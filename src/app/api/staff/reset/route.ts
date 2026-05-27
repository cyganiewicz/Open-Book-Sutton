import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/staff-auth";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const user = await prisma.staffUser.findUnique({ where: { resetToken: token } });
  if (!user) {
    return NextResponse.json({ error: "This reset link is not valid." }, { status: 404 });
  }

  return NextResponse.json({ email: user.email });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { token, password } = body;

  if (!token || !password) {
    return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const user = await prisma.staffUser.findUnique({ where: { resetToken: token } });
  if (!user) {
    return NextResponse.json({ error: "Invalid reset token" }, { status: 404 });
  }

  await prisma.staffUser.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(password),
      resetToken: null,
    },
  });

  return NextResponse.json({ success: true });
}
