"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Item { href: string; label: string }
interface Group { label: string; items: Item[] }
type Entry = Item | Group;
const isGroup = (e: Entry): e is Group => "items" in e;

// One short row instead of fifteen links: things you use daily are top-level, the rest are grouped.
const ENTRIES: Entry[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/capital", label: "Capital" },
  { href: "/admin/checkbook", label: "Checkbook" },
  { label: "Budget data", items: [
    { href: "/admin/upload", label: "Upload" }, { href: "/admin/data", label: "Data" },
    { href: "/admin/account-codes", label: "Account codes" }, { href: "/admin/tooltips", label: "Tooltips" },
  ] },
  { label: "Content", items: [
    { href: "/admin/links", label: "Links" }, { href: "/admin/documents", label: "PDFs" }, { href: "/admin/faqs", label: "FAQs" },
  ] },
  { label: "People", items: [
    { href: "/admin/users", label: "Users & invitations" }, { href: "/admin/email", label: "Email" }, { href: "/admin/requests", label: "Old capital requests" },
  ] },
  { label: "Site", items: [
    { href: "/admin/setup", label: "Settings" }, { href: "/admin/transfer", label: "Transfer" },
  ] },
];

export default function AdminNav({ previewHref }: { previewHref: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(null); setMobile(false); }, [pathname]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, []);

  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/"));
  const linkCls = (on: boolean) => `px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${on ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"}`;

  return (
    <div ref={ref} className="flex items-center gap-1">
      <nav className="hidden lg:flex items-center gap-1" aria-label="Admin navigation">
        {ENTRIES.map(e => isGroup(e) ? (
          <div key={e.label} className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={open === e.label} onClick={() => setOpen(open === e.label ? null : e.label)}
              className={linkCls(e.items.some(i => active(i.href)))}>{e.label} <span aria-hidden="true" className="text-[10px]">▾</span></button>
            {open === e.label && (
              <div role="menu" className="absolute left-0 mt-1 min-w-48 rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-50">
                {e.items.map(i => <Link key={i.href} href={i.href} role="menuitem" className={`block px-4 py-2 text-sm ${active(i.href) ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"}`}>{i.label}</Link>)}
              </div>
            )}
          </div>
        ) : <Link key={e.href} href={e.href} className={linkCls(active(e.href))} aria-current={active(e.href) ? "page" : undefined}>{e.label}</Link>)}
        {previewHref && <a href={previewHref} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap">Preview site ↗</a>}
      </nav>

      <button type="button" className="lg:hidden px-3 py-1.5 rounded-md text-sm border border-gray-300 text-gray-700" aria-expanded={mobile} aria-controls="admin-mobile-nav" onClick={() => setMobile(m => !m)}>{mobile ? "Close" : "Menu"}</button>
      {mobile && (
        <nav id="admin-mobile-nav" aria-label="Admin navigation" className="lg:hidden absolute left-0 right-0 top-full bg-white border-b border-gray-200 shadow-md px-4 py-3 z-50 max-h-[75vh] overflow-y-auto">
          {ENTRIES.map(e => isGroup(e) ? (
            <div key={e.label} className="py-1">
              <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{e.label}</p>
              {e.items.map(i => <Link key={i.href} href={i.href} className={`block ${linkCls(active(i.href))}`}>{i.label}</Link>)}
            </div>
          ) : <Link key={e.href} href={e.href} className={`block ${linkCls(active(e.href))}`}>{e.label}</Link>)}
          {previewHref && <a href={previewHref} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-sm font-medium text-blue-600">Preview site ↗</a>}
        </nav>
      )}
    </div>
  );
}
