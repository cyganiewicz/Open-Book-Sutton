"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

interface PortalHeaderProps {
  townName: string;
  townSlug: string;
  primaryColor: string;
  logoUrl?: string | null;
}

const NAV_ITEMS = [
  { label: "Overview", path: "" },
  { label: "Expenses", path: "/expenses" },
  { label: "Revenues", path: "/revenues" },
  { label: "Capital", path: "/capital" },
  { label: "Documents", path: "/documents" },
  { label: "Budget Book", path: "/budget-book" },
  { label: "FAQ", path: "/faq" },
];

export default function PortalHeader({
  townName,
  townSlug,
  primaryColor,
  logoUrl,
}: PortalHeaderProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (path: string) => {
    const fullPath = `/${townSlug}${path}`;
    if (path === "") return pathname === `/${townSlug}`;
    return pathname.startsWith(fullPath);
  };

  const isOverview = pathname === `/${townSlug}`;

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled || !isOverview
            ? "bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm"
            : "bg-transparent"
        }`}
        role="banner"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <Link
              href={`/${townSlug}`}
              className="flex items-center gap-3 shrink-0 group"
              aria-label={`OpenBook ${townName} home`}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${townName} seal`}
                  className="h-9 w-9 object-contain rounded-full"
                />
              ) : (
                <div className="h-9 w-9 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: primaryColor }}>
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21" />
                  </svg>
                </div>
              )}
              <div className="leading-tight">
                <p className={`font-bold text-sm tracking-tight transition-colors ${
                  scrolled || !isOverview ? "text-gray-900" : "text-white"
                }`}>{townName}</p>
                <p className={`text-xs font-medium tracking-wider uppercase transition-colors ${
                  scrolled || !isOverview ? "text-gray-400" : "text-white/60"
                }`} style={{ fontSize: "0.6rem", letterSpacing: "0.12em" }}>OpenBook</p>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-0.5" aria-label="Main navigation">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={`/${townSlug}${item.path}`}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                    isActive(item.path)
                      ? scrolled || !isOverview
                        ? "text-white"
                        : "bg-white/20 text-white"
                      : scrolled || !isOverview
                        ? "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                        : "text-white/80 hover:text-white hover:bg-white/10"
                  }`}
                  style={isActive(item.path) && (scrolled || !isOverview) ? { backgroundColor: primaryColor } : {}}
                  aria-current={isActive(item.path) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              className={`md:hidden p-2 rounded-md transition-colors ${
                scrolled || !isOverview
                  ? "text-gray-600 hover:bg-gray-100"
                  : "text-white hover:bg-white/10"
              }`}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {mobileOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                }
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <nav
            className="absolute top-0 right-0 h-full w-64 bg-white shadow-xl flex flex-col pt-20 px-4"
            onClick={e => e.stopPropagation()}
            aria-label="Mobile navigation"
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"
              aria-label="Close navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
              {logoUrl && <img src={logoUrl} alt="" className="h-8 w-8 object-contain rounded-full" />}
              <div>
                <p className="font-bold text-sm text-gray-900">{townName}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider" style={{ fontSize: "0.6rem" }}>OpenBook</p>
              </div>
            </div>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={`/${townSlug}${item.path}`}
                onClick={() => setMobileOpen(false)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors ${
                  isActive(item.path)
                    ? "text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
                style={isActive(item.path) ? { backgroundColor: primaryColor } : {}}
                aria-current={isActive(item.path) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
