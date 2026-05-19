import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Verification token is required" },
      { status: 400 }
    );
  }

  // Check AdminUser first
  const adminUser = await prisma.adminUser.findFirst({
    where: { verificationToken: token },
  });

  if (adminUser) {
    await prisma.adminUser.update({
      where: { id: adminUser.id },
      data: {
        emailVerified: true,
        verificationToken: null,
      },
    });

    const redirectUrl = new URL("/admin", request.url);
    redirectUrl.searchParams.set("verified", "true");
    return NextResponse.redirect(redirectUrl);
  }

  // Check StaffUser
  const staffUser = await prisma.staffUser.findFirst({
    where: { verificationToken: token },
  });

  if (staffUser) {
    await prisma.staffUser.update({
      where: { id: staffUser.id },
      data: {
        emailVerified: true,
        verificationToken: null,
      },
    });

    const redirectUrl = new URL("/staff", request.url);
    redirectUrl.searchParams.set("verified", "true");
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.json(
    { error: "Invalid or expired verification token" },
    { status: 404 }
  );
}
