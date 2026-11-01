import { redirect } from "next/navigation";
import { getActor } from "@/lib/capital/actor";
import StaffCapitalList from "@/components/capital/StaffCapitalList";

export const dynamic = "force-dynamic";

export default async function StaffCapitalPage() {
  const actor = await getActor();
  if (!actor) redirect("/staff/login");
  return <StaffCapitalList />;
}
