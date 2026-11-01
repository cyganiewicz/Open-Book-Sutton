import { NextResponse } from "next/server";
import { getActor } from "@/lib/capital/actor";
import { guarded, requireActor } from "@/lib/capital/http";
import { deleteAttachment, getAttachmentForViewing, updateAttachment } from "@/lib/capital/projects";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ fileId: string }> };

// Serves photos/documents. Public photos of public projects need no login; everything else is permission-checked.
export const GET = (_req: Request, { params }: Ctx) => guarded(async () => {
  const file = await getAttachmentForViewing((await params).fileId, await getActor());
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const safeName = file.fileName.replace(/[^\w.\- ()]/g, "_");
  return new NextResponse(file.data as unknown as BodyInit, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": file.isPublicFile ? "public, max-age=3600" : "private, no-store",
    },
  });
});

export const PATCH = (req: Request, { params }: Ctx) => guarded(async () => {
  const actor = await requireActor();
  const body = await req.json().catch(() => ({}));
  await updateAttachment(actor, (await params).fileId, body);
  return NextResponse.json({ ok: true });
});

export const DELETE = (_req: Request, { params }: Ctx) => guarded(async () => {
  const actor = await requireActor();
  await deleteAttachment(actor, (await params).fileId);
  return NextResponse.json({ ok: true });
});
