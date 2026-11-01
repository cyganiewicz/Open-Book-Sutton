import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/capital/actor";
import NewProjectForm from "@/components/capital/NewProjectForm";

export const dynamic = "force-dynamic";

export default async function NewAdminProject() {
  const actor = await getActor();
  if (!actor || actor.kind !== "admin") redirect("/admin/login");
  const departments = await prisma.capitalDepartment.findMany({ where: { townId: actor.townId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New capital project</h1>
      {departments.length === 0 && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">Add departments first under Capital → Setup (or import the FY2027 plan, which creates them).</p>}
      <NewProjectForm departments={departments} basePath="/admin/capital" />
    </div>
  );
}
