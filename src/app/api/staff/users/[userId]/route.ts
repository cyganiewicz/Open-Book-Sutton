import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const body = await request.json();
  const { emailVerified } = body;

  const user = await prisma.staffUser.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.staffUser.update({
    where: { id: userId },
    data: { emailVerified },
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    emailVerified: updated.emailVerified,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  const user = await prisma.staffUser.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.staffSession.deleteMany({ where: { userId } });
  await prisma.staffUser.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
