import { NextResponse } from "next/server";
import { guarded, requireAdmin } from "@/lib/capital/http";
import { CapitalError } from "@/lib/capital/projects";
import * as A from "@/lib/capital/admin";

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
        capacityByYear: b.capacityByYear, weights: b.weights, planLength: b.planLength,
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
    default:
      throw new CapitalError("Unknown action.");
  }
});
