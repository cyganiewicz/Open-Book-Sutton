import { redirect } from "next/navigation";

// Department heads land on their capital projects. (The older request form and history are
// replaced by the Capital Projects screens.)
export default function StaffHome() {
  redirect("/staff/capital");
}
