import { NextResponse } from "next/server";
import { CapitalError } from "./projects";
import { getActor } from "./actor";
import type { Actor } from "./permissions";

/** Runs a handler and turns our errors into clean JSON responses (never leaks internals) */
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CapitalError) return NextResponse.json({ error: e.message, details: e.details ?? [] }, { status: e.status });
    console.error("Capital API error:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) throw new CapitalError("Please sign in.", 401);
  return a;
}
export async function requireAdmin(): Promise<Actor> {
  const a = await requireActor();
  if (a.kind !== "admin") throw new CapitalError("Administrators only.", 403);
  return a;
}
