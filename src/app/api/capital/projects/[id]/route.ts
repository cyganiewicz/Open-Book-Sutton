import { NextResponse } from "next/server";
import { guarded, requireActor } from "@/lib/capital/http";
import { deleteProject, getProject, updateProject } from "@/lib/capital/projects";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const GET = (_req: Request, { params }: Ctx) => guarded(async () => {
  const actor = await requireActor();
  return NextResponse.json(await getProject(actor, (await params).id));
});

export const PATCH = (req: Request, { params }: Ctx) => guarded(async () => {
  const actor = await requireActor();
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await updateProject(actor, (await params).id, { fields: body.fields, years: body.years }));
});

export const DELETE = (_req: Request, { params }: Ctx) => guarded(async () => {
  const actor = await requireActor();
  await deleteProject(actor, (await params).id);
  return NextResponse.json({ ok: true });
});
