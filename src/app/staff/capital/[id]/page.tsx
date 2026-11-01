import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/capital/actor";
import { getProject, loadCapitalSettings } from "@/lib/capital/projects";
import CapitalProjectEditor from "@/components/capital/CapitalProjectEditor";

export const dynamic = "force-dynamic";

export default async function StaffProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/staff/login");
  const project = await getProject(actor, id).catch(() => null);
  if (!project) notFound();
  const [settings, town] = await Promise.all([loadCapitalSettings(actor.townId), prisma.town.findUnique({ where: { id: actor.townId }, select: { slug: true } })]);
  return <CapitalProjectEditor initial={project} mode={actor.kind === "admin" ? "admin" : "staff"} adoptedFY={settings.adoptedFY} weights={settings.weights} townSlug={town?.slug ?? ""} />;
}
