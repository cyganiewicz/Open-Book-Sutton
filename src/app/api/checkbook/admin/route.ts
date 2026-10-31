import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as admin from "@/lib/checkbook/admin";

export const dynamic = "force-dynamic";

async function guard(townId: string | null) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!townId) return { error: NextResponse.json({ error: "townId is required." }, { status: 400 }) };
  const town = await prisma.town.findUnique({ where: { id: townId }, select: { id: true } });
  if (!town) return { error: NextResponse.json({ error: "Town not found." }, { status: 404 }) };
  return { user };
}

export async function GET(request: Request) {
  const townId = new URL(request.url).searchParams.get("townId");
  const g = await guard(townId);
  if (g.error) return g.error;
  return NextResponse.json(await admin.getAdminOverview(townId!));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const townId: string | null = typeof body.townId === "string" ? body.townId : null;
  const g = await guard(townId);
  if (g.error) return g.error;
  const by = g.user!.email;

  try {
    switch (body.action) {
      case "classifyVendor": {
        if (body.kind !== "business" && body.kind !== "individual") throw new Error("Choose business or individual.");
        const r = await admin.classifyVendor({
          townId: townId!, vendorId: String(body.vendorId), kind: body.kind,
          displayName: typeof body.displayName === "string" ? body.displayName : undefined, by,
        });
        return NextResponse.json({ ok: true, ...r });
      }
      case "bulkApprove":
        return NextResponse.json({ ok: true, ...(await admin.bulkApproveSuggestedBusiness(townId!, by)) });
      case "resolvePayment": {
        const actions = ["publish_as_written", "publish_name_redacted", "publish_no_memo", "exclude"];
        if (!actions.includes(body.resolution)) throw new Error("Unknown action.");
        await admin.resolvePayment({ townId: townId!, paymentId: String(body.paymentId), action: body.resolution });
        return NextResponse.json({ ok: true });
      }
      case "dismissFlag":
        await admin.dismissFlag(townId!, String(body.paymentId));
        return NextResponse.json({ ok: true });
      case "reapplyAccountCodes":
        return NextResponse.json({ ok: true, ...(await admin.reapplyAccountCodes(townId!)) });
      case "recheckHeld":
        return NextResponse.json({ ok: true, ...(await admin.recheckHeld(townId!)) });
      case "saveSettings":
        await admin.saveSettings(townId!, {
          rulesText: String(body.rulesText ?? ""),
          largeIndividualThreshold: Number(body.largeIndividualThreshold),
          redactStreetNumbers: !!body.redactStreetNumbers,
          safePhrasesText: String(body.safePhrasesText ?? ""),
        });
        return NextResponse.json({ ok: true });
      case "deleteBatch":
        await admin.deleteBatch(townId!, String(body.batchId));
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed." }, { status: 400 });
  }
}
