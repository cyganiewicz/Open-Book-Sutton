// Works out who is calling: an administrator, a department head, or nobody.
// Kept separate from projects.ts so the core logic can be tested without Next.js.

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentStaff } from "@/lib/staff-auth";
import type { Actor } from "./permissions";

export async function getActor(): Promise<Actor | null> {
  const admin = await getCurrentUser();
  if (admin) {
    const town = await prisma.town.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!town) return null;
    return { kind: "admin", id: admin.id, name: admin.name || admin.email, email: admin.email, townId: town.id, departmentIds: [] };
  }
  const staff = await getCurrentStaff();
  if (staff) {
    const memberships = await prisma.capitalDepartmentMember.findMany({ where: { staffUserId: staff.id }, select: { departmentId: true } });
    return { kind: "staff", id: staff.id, name: staff.name, email: staff.email, townId: staff.townId, departmentIds: memberships.map(m => m.departmentId) };
  }
  return null;
}
