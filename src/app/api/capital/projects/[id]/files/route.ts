import { NextResponse } from "next/server";
import { guarded, requireActor } from "@/lib/capital/http";
import { CapitalError, addAttachment } from "@/lib/capital/projects";

export const dynamic = "force-dynamic";

export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => guarded(async () => {
  const actor = await requireActor();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new CapitalError("Choose a file to upload.");
  if (file.size > 9 * 1024 * 1024) throw new CapitalError("That file is too large.");
  const att = await addAttachment(actor, (await params).id, {
    kind: String(form.get("kind") ?? "document"), fileName: file.name,
    data: new Uint8Array(await file.arrayBuffer()), caption: form.get("caption") ? String(form.get("caption")) : null,
  });
  return NextResponse.json(att, { status: 201 });
});
