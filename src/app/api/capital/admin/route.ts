import { NextResponse } from "next/server";
import { guarded, requireAdmin } from "@/lib/capital/http";
import { CapitalError } from "@/lib/capital/projects";
import * as A from "@/lib/capital/admin";
import { sendCallForProjects, sendReminders } from "@/lib/capital/notify";

export const dynamic = "force-dynamic";

export const GET = () => guarded(async () => {
  const actor = await requireAdmin();
  return NextResponse.json(await A.getCapitalOverview(actor.townId));
});

export const POST = (req: Request) => guarded(async () => {
  const actor = await requireAdmin();
  const b = await req.json().catch(() => ({}));
  switch (b.action) {
    case "saveSettings":
      return NextResponse.json(await A.saveCapitalSettings(actor.townId, {
        adoptedFY: b.adoptedFY, submissionsOpen: b.submissionsOpen, submissionDeadline: b.submissionDeadline || null,
        capacityByYear: b.capacityByYear, weights: b.weights, planLength: b.planLength, emailsEnabled: b.emailsEnabled,
      }));
    case "saveDepartment":
      await A.saveDepartment(actor.townId, { id: b.id, name: String(b.name ?? ""), code: String(b.code ?? "") });
      return NextResponse.json({ ok: true });
    case "deleteDepartment":
      await A.deleteDepartment(actor.townId, String(b.id));
      return NextResponse.json({ ok: true });
    case "setMembers":
      await A.setDepartmentMembers(actor.townId, String(b.departmentId), Array.isArray(b.staffUserIds) ? b.staffUserIds.map(String) : []);
      return NextResponse.json({ ok: true });
    case "previewSeed":
      return NextResponse.json(await A.previewSeed(actor.townId));
    case "commitSeed":
      return NextResponse.json(await A.commitSeed(actor.townId, actor.name));
    case "bulkPublish":
      return NextResponse.json({ count: await A.bulkPublish(actor.townId, Array.isArray(b.statuses) ? b.statuses.map(String) : [], b.isPublic !== false) });
    case "previewRollForward":
      return NextResponse.json(await A.previewRollForward(actor.townId, typeof b.targetFY === "string" ? b.targetFY : undefined));
    case "commitRollForward":
      return NextResponse.json(await A.commitRollForward(actor.townId, String(b.targetFY ?? ""), actor.name));
    case "sendCall":
      return NextResponse.json(await sendCallForProjects(actor.townId, typeof b.note === "string" ? b.note.slice(0, 1000) : undefined));
    case "sendReminders":
      return NextResponse.json(await sendReminders(actor.townId));
    default:
      throw new CapitalError("Unknown action.");
  }
});
