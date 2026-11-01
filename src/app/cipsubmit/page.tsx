import { redirect } from "next/navigation";

// The CIP memo points departments to /cipsubmit. Send them to the capital project screen
// (staff login is requested automatically if they aren't signed in).
export default function CipSubmit() {
  redirect("/staff/capital");
}
