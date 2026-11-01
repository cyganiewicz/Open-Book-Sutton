import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/capital/actor";
import NewProjectForm from "@/components/capital/NewProjectForm";

export const dynamic = "force-dynamic";

export default async function NewStaffProject() {
  const actor = await getActor();
  if (!actor) redirect("/staff/login");
  const departments = await prisma.capitalDepartment.findMany({
    where: actor.kind === "admin" ? { townId: actor.townId } : { townId: actor.townId, id: { in: actor.departmentIds } },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New project request</h1>
      <NewProjectForm departments={departments} basePath="/staff/capital" />
    </div>
  );
}
