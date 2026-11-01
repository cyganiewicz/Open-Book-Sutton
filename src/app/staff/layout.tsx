import Link from "next/link";
import { getCurrentStaff } from "@/lib/staff-auth";
import StaffLogoutButton from "@/components/staff/LogoutButton";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getCurrentStaff();

  // If not authenticated, render children without chrome (for login/register pages)
  if (!staff) {
    return <>{children}</>;
  }

  const headerColor = staff.town?.primaryColor || "#0f766e";

  return (
    <div className="min-h-screen flex flex-col">
      <header style={{ backgroundColor: headerColor }} className="text-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/staff" className="text-lg font-semibold tracking-tight">
            OpenBook <span className="text-white/70 font-normal">Staff Portal</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm" aria-label="Staff navigation">
            <Link href="/staff/capital" className="text-white/90 hover:text-white font-medium">
              Capital Projects
            </Link>
            <span className="hidden sm:inline text-white/60" title={staff.email}>{staff.name}</span>
            <StaffLogoutButton />
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {children}
      </main>
    </div>
  );
}
