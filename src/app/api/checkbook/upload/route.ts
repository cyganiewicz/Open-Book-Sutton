import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { processExtract, UploadError } from "@/lib/checkbook/ingest";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export async function POST(request: Request) {
  // Admin only. (The middleware only guards pages, so every route checks for itself.)
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const townId = String(form.get("townId") || "");
  const mode = form.get("mode") === "commit" ? "commit" : "preview";

  if (!file || !townId) return NextResponse.json({ error: "A file and townId are required." }, { status: 400 });
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
    return NextResponse.json({ error: "Please upload an Excel (.xlsx) or CSV (.csv) file." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "That file is larger than 15MB." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const report = await processExtract({ townId, fileName: file.name, buffer, mode, uploadedBy: user.email });
    return NextResponse.json(report);
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("Checkbook upload failed:", e);
    return NextResponse.json({ error: "Something went wrong processing that file." }, { status: 500 });
  }
}
