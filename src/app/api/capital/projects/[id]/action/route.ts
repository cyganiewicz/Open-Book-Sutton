import { NextResponse } from "next/server";
import { guarded, requireActor } from "@/lib/capital/http";
import { CapitalError, performAction, type ActionName } from "@/lib/capital/projects";

export const dynamic = "force-dynamic";
const ACTIONS: ActionName[] = ["submit", "resubmit", "withdraw", "setRequestStatus", "approveYear", "unapproveYear", "setPublic", "evaluate", "postStatus", "comment", "resolveComment"];

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => guarded(async () => {
  const actor = await requireActor();
  const body = await req.json().catch(() => ({}));
  if (!ACTIONS.includes(body.action)) throw new CapitalError("Unknown action.");
  const { action, ...payload } = body;
  return NextResponse.json(await performAction(actor, (await params).id, action, payload));
});
