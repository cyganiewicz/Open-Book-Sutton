import { NextResponse } from "next/server";
import { guarded, requireAdmin } from "@/lib/capital/http";
import { CapitalError, loadCapitalSettings } from "@/lib/capital/projects";
import { commitHistory, legacyRows, parseHistoryFile, previewHistory } from "@/lib/capital/history";

export const dynamic = "force-dynamic";

// Prior-year funded projects: from a spreadsheet, or from capital data already uploaded under Upload.
export const POST = (req: Request) => guarded(async () => {
  const actor = await requireAdmin();
  const form = await req.formData();
  const source = form.get("source") === "legacy" ? "legacy" : "file";
  const mode = form.get("mode") === "commit" ? "commit" : "preview";
  const settings = await loadCapitalSettings(actor.townId);

  let rows; let errors: { row: number; reason: string }[] = [];
  if (source === "legacy") {
    rows = await legacyRows(actor.townId, settings.adoptedFY);
  } else {
    const file = form.get("file");
    if (!(file instanceof File)) throw new CapitalError("Choose a spreadsheet to upload.");
    const n = file.name.toLowerCase();
    if (!n.endsWith(".xlsx") && !n.endsWith(".csv")) throw new CapitalError("Please upload an Excel (.xlsx) or CSV (.csv) file.");
    if (file.size > 5 * 1024 * 1024) throw new CapitalError("That file is larger than 5 MB.");
    ({ rows, errors } = parseHistoryFile(Buffer.from(await file.arrayBuffer()), file.name));
  }
  if (mode === "preview") return NextResponse.json(await previewHistory(actor.townId, rows, errors));
  return NextResponse.json(await commitHistory(actor.townId, rows, actor.name));
});
