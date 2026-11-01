import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/capital/actor";
import { getProject, loadCapitalSettings } from "@/lib/capital/projects";
import CapitalProjectEditor from "@/components/capital/CapitalProjectEditor";

export const dynamic = "force-dynamic";

export default async function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor || actor.kind !== "admin") redirect("/admin/login");
  const project = await getProject(actor, id).catch(() => null);
  if (!project) notFound();
  const [settings, town, departments] = await Promise.all([
    loadCapitalSettings(actor.townId),
    prisma.town.findUnique({ where: { id: actor.townId }, select: { slug: true } }),
    prisma.capitalDepartment.findMany({ where: { townId: actor.townId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <CapitalProjectEditor initial={project} mode="admin" adoptedFY={settings.adoptedFY} weights={settings.weights} departments={departments} townSlug={town?.slug ?? ""} />;
}
