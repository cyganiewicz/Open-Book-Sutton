export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import PortalHeader from "@/components/portal/PortalHeader";
import Link from "next/link";

export default async function TownLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ townSlug: string }>;
}) {
  const { townSlug } = await params;
  const town = await prisma.town.findUnique({ where: { slug: townSlug } });

  if (!town || !town.published) return notFound();

  const isOverviewPage = false; // layout doesn't know the page; header handles it

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--background, #f9f8f6)" }}>
      <PortalHeader
        townName={town.name}
        townSlug={town.slug}
        primaryColor={town.primaryColor}
        logoUrl={town.logoUrl}
      />
      <main
        id="main-content"
        className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-0"
      >
        {children}
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-gray-200 bg-white">
        {/* Trust band */}
        <div className="border-b border-gray-100 py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Built for Residents.</h2>
                <p className="text-gray-500 text-sm leading-relaxed max-w-md">
                  OpenBook gives every {town.name} resident direct access to the information behind town financial decisions — clearly, completely, and at no cost.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: "🔄", label: "Updated regularly" },
                  { icon: "📋", label: "Adopted municipal data" },
                  { icon: "🔓", label: "No account required" },
                  { icon: "♿", label: "Designed for everyone" },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2.5">
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-sm text-gray-600 font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer links */}
        <div className="py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {town.logoUrl && (
                <img src={town.logoUrl} alt="" className="h-8 w-8 object-contain rounded-full opacity-70" />
              )}
              <div>
                <p className="font-semibold text-gray-800 text-sm">Town of {town.name}</p>
                <p className="text-xs text-gray-400">Powered by <span className="font-medium">OpenBook</span></p>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {[
                { label: "Overview", href: `/${town.slug}` },
                { label: "Expenses", href: `/${town.slug}/expenses` },
                { label: "Revenues", href: `/${town.slug}/revenues` },
                { label: "Capital", href: `/${town.slug}/capital` },
                { label: "Budget Book", href: `/${town.slug}/budget-book` },
                { label: "FAQ", href: `/${town.slug}/faq` },
                ...(town.contactEmail ? [{ label: "Contact", href: `mailto:${town.contactEmail}` }] : []),
              ].map(item => (
                <a key={item.label} href={item.href}
                  className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
