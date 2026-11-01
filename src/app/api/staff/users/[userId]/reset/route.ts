import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { appBaseUrl, sendPasswordResetEmail } from "@/lib/email";

export async function POST(
  request: Request,
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

  const resetToken = randomUUID();

  await prisma.staffUser.update({
    where: { id: userId },
    data: { resetToken },
  });

  const resetUrl = `${await appBaseUrl(request)}/staff/reset?token=${resetToken}`;
  const sent = await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl, townId: user.townId });

  return NextResponse.json({ resetToken, email: user.email, emailed: sent.ok, emailError: sent.ok ? null : sent.error ?? "The email could not be sent." });
}
