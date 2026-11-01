import { NextResponse } from "next/server";
import { guarded, requireActor } from "@/lib/capital/http";
import { createProject, listProjects } from "@/lib/capital/projects";

export const dynamic = "force-dynamic";

export const GET = () => guarded(async () => {
  const actor = await requireActor();
  return NextResponse.json(await listProjects(actor));
});

export const POST = (req: Request) => guarded(async () => {
  const actor = await requireActor();
  const body = await req.json().catch(() => ({}));
  const project = await createProject(actor, { departmentId: String(body.departmentId ?? ""), fields: body.fields, years: body.years });
  return NextResponse.json(project, { status: 201 });
});
