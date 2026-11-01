export const dynamic = "force-dynamic";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AdminLogoutButton from "@/components/admin/LogoutButton";
import AdminNav from "@/components/admin/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // If not authenticated, render children without admin chrome (login/register pages)
  if (!user) {
    return <>{children}</>;
  }

  const town = await prisma.town.findFirst({ select: { slug: true } });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="relative border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/admin" className="text-lg font-semibold tracking-tight shrink-0">
            OpenBook <span className="text-gray-500 font-normal">Admin</span>
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <AdminNav previewHref={town ? `/${town.slug}` : null} />
            <AdminLogoutButton />
          </div>
        </div>
      </header>
      <main id="main-content" className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">{children}</main>
    </div>
  );
}
