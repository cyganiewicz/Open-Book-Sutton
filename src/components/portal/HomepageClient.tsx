"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { abbreviateCurrency, formatCurrency } from "@/lib/format";
import type { SiteText } from "@/lib/site-text";

// ── Design tokens ──────────────────────────────────────────────
// Disciplined palette: Sutton deep green, sage, cream, gold, slate
const T = {
  green:  "#1B3A2D",
  sage:   "#4A6741",
  sage2:  "#7A9E73",
  cream:  "#F4F1E8",
  cream2: "#FDFCF8",
  gold:   "#A67C3B",
  gold2:  "#D4A853",
  slate:  "#3B5E7A",
  stone:  "#8B8070",
  // Chart palette — disciplined, not rainbow
  chart: ["#1B3A2D","#3B5E7A","#7A3B2E","#A67C3B","#5C3B7A","#3B7A6A"],
};

interface TownData {
  name: string;
  slug: string;
  primaryColor: string;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  aboutText?: string | null;
  contactEmail?: string | null;
}

interface BudgetData {
  hasData: boolean;
  expYear: string;
  revYear: string;
  latestCapYear: string;
  totalExpenses: number;
  totalRevenues: number;
  totalCapital: number;
  balance: number;
  topFunctions: [string, number][];
  topRevenues: [string, number][];
  topCapDepts: [string, number][];
  lineItemCount: number;
}

// ── Animated counter ─────────────────────────────────────────
function Counter({ value, prefix = "$", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const [displayed, setDisplayed] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStarted(true); }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const duration = 1200;
    const start = performance.now();
    const raf = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(ease * value));
      if (t < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [started, value]);

  const formatted = displayed >= 1_000_000
    ? `${prefix}${(displayed / 1_000_000).toFixed(1)}M${suffix}`
    : displayed >= 1_000
    ? `${prefix}${(displayed / 1_000).toFixed(0)}K${suffix}`
    : `${prefix}${displayed}${suffix}`;

  return <span ref={ref}>{started ? formatted : `${prefix}0`}</span>;
}

// ── Scroll reveal hook ────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.08 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

// ── Section wrapper with reveal ───────────────────────────────
function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { ref, visible } = useReveal();
  return (
    <div ref={ref}
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${className}`}>
      {children}
    </div>
  );
}

// ── Eye-brow label ────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.18em] mb-3" style={{ color: T.gold }}>
      {children}
    </p>
  );
}

// ── Section divider ───────────────────────────────────────────
function Rule() {
  return <div className="border-t border-gray-200 my-0" />;
}

// ── Main component ────────────────────────────────────────────
export default function HomepageClient({ town, data, siteText, budgetSectionBody }: { town: TownData; data: BudgetData; siteText: SiteText; budgetSectionBody: string }) {
  const color = town.primaryColor;
  const slug = town.slug;

  const {
    hasData, expYear, revYear, latestCapYear,
    totalExpenses, totalRevenues, totalCapital, balance,
    topFunctions, topRevenues, topCapDepts, lineItemCount,
  } = data;

  return (
    <div className="pb-0 -mt-0">

      {/* ══════════════════════════════════════════════════════
          1. HERO — full-bleed, editorial, image-backed
      ══════════════════════════════════════════════════════ */}
      <section
        className="relative flex flex-col justify-center overflow-hidden -mx-4 sm:-mx-6 mb-0"
        aria-label="Hero"
      >
        {/* Background */}
        {town.heroImageUrl ? (
          <>
            <img src={town.heroImageUrl} alt=""
              className="absolute inset-0 w-full h-full object-cover" aria-hidden="true" />
            <div className="absolute inset-0"
              style={{ background: `linear-gradient(to bottom, ${color}99 0%, ${color}f2 60%, ${color} 100%)` }} />
          </>
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: color }}>
            {/* Subtle topographic texture */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.04]" aria-hidden="true">
              <defs>
                <pattern id="topo" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="white" strokeWidth="0.5"/>
                  <circle cx="60" cy="60" r="38" fill="none" stroke="white" strokeWidth="0.5"/>
                  <circle cx="60" cy="60" r="26" fill="none" stroke="white" strokeWidth="0.5"/>
                  <circle cx="60" cy="60" r="14" fill="none" stroke="white" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#topo)"/>
            </svg>
            {/* Subtle grain */}
            <div className="absolute inset-0 opacity-[0.03]"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")",
                backgroundSize: "200px 200px" }} />
          </div>
        )}

        {/* Fine horizontal rule near top */}
        <div className="absolute top-24 left-0 right-0 border-t border-white/10" />

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

            {/* Left: headline + CTAs */}
            <div className="lg:col-span-7">
              <div className="flex items-center gap-3 mb-6">
                {town.logoUrl && (
                  <img src={town.logoUrl} alt={`${town.name} seal`}
                    className="w-12 h-12 object-contain rounded-full border border-white/20" />
                )}
                <div>
                  <p className="text-white/50 text-[10px] font-bold uppercase tracking-[0.2em]">
                    Municipal Budget Transparency
                  </p>
                  <p className="text-white/80 text-sm font-medium">{town.name}</p>
                </div>
              </div>

              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[0.95] mb-6">
{siteText.heroHeadline}<br />
                <span style={{ color: T.gold2 }}>{siteText.heroAccent}</span><br />
                {siteText.heroSuffix}
              </h1>

              <p className="text-white/70 text-lg max-w-lg leading-relaxed mb-8">
                {town.aboutText ||
                  siteText.heroSubtext}
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href={`/${slug}/expenses`}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95"
                  style={{ backgroundColor: T.gold2, color: "#1a1a1a" }}>
                  {siteText.heroCtaPrimary}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                  </svg>
                </Link>
                <Link href={`/${slug}/capital`}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold border border-white/30 text-white hover:bg-white/10 transition-all">
                  {siteText.heroCtaSecondary}
                </Link>
              </div>
            </div>

            {/* Right: at-a-glance data panel */}
            {hasData && (
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-white/15 overflow-hidden"
                  style={{ backgroundColor: "rgba(0,0,0,0.25)", backdropFilter: "blur(16px)" }}>
                  <div className="px-5 py-3 border-b border-white/10">
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.18em]">
                      FY{expYear} at a Glance
                    </p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-white/10">
                    {[
                      { label: "Operating Budget", value: totalExpenses },
                      { label: "Total Revenue", value: totalRevenues },
                      { label: "Capital Investment", value: totalCapital },
                      { label: "Expense Line Items", value: lineItemCount, isCount: true },
                    ].map((stat, i) => (
                      <div key={stat.label}
                        className={`px-5 py-4 ${i >= 2 ? "border-t border-white/10" : ""}`}>
                        <p className="text-white/40 text-[9px] font-bold uppercase tracking-[0.15em] mb-1">
                          {stat.label}
                        </p>
                        <p className="text-white text-2xl font-extrabold tabular-nums">
                          {stat.isCount
                            ? <Counter value={stat.value} prefix="" />
                            : <Counter value={stat.value} />
                          }
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Budget river — the signature element */}
          {hasData && totalExpenses > 0 && (
            <div className="mt-12 pt-8 border-t border-white/10">
              <p className="text-white/30 text-[9px] font-bold uppercase tracking-[0.2em] mb-2">
                FY{expYear} Budget · Proportional by Function
              </p>
              <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {topFunctions.map(([fn, amt], i) => (
                  <div key={fn}
                    style={{
                      width: `${(amt / totalExpenses) * 100}%`,
                      backgroundColor: T.chart[i % T.chart.length],
                    }}
                    title={`${fn}: ${abbreviateCurrency(amt)}`}
                    className="transition-all hover:brightness-125 cursor-default"
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5">
                {topFunctions.slice(0, 5).map(([fn, amt], i) => (
                  <span key={fn} className="flex items-center gap-1.5 text-white/45 text-[10px]">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: T.chart[i % T.chart.length] }} />
                    {fn} · {abbreviateCurrency(amt)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          2. FOLLOW THE DOLLAR — editorial flow section
      ══════════════════════════════════════════════════════ */}
      <section className="py-16 px-4 sm:px-6 -mx-4 sm:-mx-6 bg-white" aria-label="How the budget works">
        <Section>
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-10">
              <Eyebrow>Understanding the budget</Eyebrow>
              <h2 className="text-3xl font-extrabold tracking-tight" style={{ color: T.green }}>
                {siteText.followTitle}
              </h2>
              <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm">
                {siteText.followSubtext}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
              {[
                {
                  step: "01",
                  title: siteText.followStep1Title,
                  body: siteText.followStep1Body,
                  href: `/${slug}/revenues`,
                  icon: (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9" />
                    </svg>
                  ),
                },
                {
                  step: "02",
                  title: siteText.followStep2Title,
                  body: siteText.followStep2Body,
                  href: `/${slug}/budget-book`,
                  icon: (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                    </svg>
                  ),
                },
                {
                  step: "03",
                  title: siteText.followStep3Title,
                  body: siteText.followStep3Body,
                  href: `/${slug}/expenses`,
                  icon: (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                    </svg>
                  ),
                },
                {
                  step: "04",
                  title: siteText.followStep4Title,
                  body: siteText.followStep4Body,
                  href: `/${slug}/capital`,
                  icon: (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                    </svg>
                  ),
                },
              ].map((item, i) => (
                <Link key={item.step} href={item.href}
                  className="group flex flex-col p-6 border-l border-gray-100 first:border-l-0 sm:first:border-l sm:border-t-0 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2.5 rounded-xl" style={{ backgroundColor: `${color}12`, color }}>
                      {item.icon}
                    </div>
                    <span className="text-4xl font-black tabular-nums leading-none" style={{ color: `${color}15` }}>
                      {item.step}
                    </span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1.5 group-hover:text-opacity-80">{item.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed flex-1">{item.body}</p>
                  <p className="mt-4 text-xs font-bold flex items-center gap-1 transition-all group-hover:gap-2"
                    style={{ color }}>
                    Learn more
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                    </svg>
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </Section>
      </section>

      <Rule />

      {/* ══════════════════════════════════════════════════════
          3. WHERE SUTTON INVESTS — budget by function
      ══════════════════════════════════════════════════════ */}
      {hasData && (
        <section className="py-16 px-4 sm:px-6 -mx-4 sm:-mx-6" style={{ backgroundColor: T.cream }}
          aria-label="Budget by function">
          <Section>
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

                {/* Left: editorial text */}
                <div className="lg:col-span-4">
                  <Eyebrow>FY{expYear} Budget</Eyebrow>
                  <h2 className="text-4xl font-extrabold tracking-tight mb-4" style={{ color: T.green }}>
                    {siteText.budgetSectionTitle}
                  </h2>
                  <p className="text-gray-600 leading-relaxed text-sm mb-6">
                    {budgetSectionBody}
                  </p>
                  <div className="border-l-4 pl-4 mb-6" style={{ borderColor: T.gold }}>
                    <p className="text-2xl font-extrabold tabular-nums" style={{ color: T.green }}>
                      {abbreviateCurrency(totalExpenses)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 uppercase tracking-wider font-semibold">
                      Total FY{expYear} Operating Budget
                    </p>
                  </div>
                  <Link href={`/${slug}/expenses`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{ backgroundColor: color }}>
                    View All Expenses
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                    </svg>
                  </Link>
                </div>

                {/* Right: sophisticated ranked bar chart */}
                <div className="lg:col-span-8">
                  <div className="space-y-1">
                    {topFunctions.slice(0, 7).map(([fn, amt], i) => {
                      const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                      const isLargest = i === 0;
                      return (
                        <Link key={fn} href={`/${slug}/expenses`}
                          className="group flex items-center gap-4 py-3 px-4 rounded-xl hover:bg-white/60 transition-all border border-transparent hover:border-white hover:shadow-sm">
                          {/* Rank */}
                          <span className="text-sm font-black tabular-nums w-6 text-right flex-shrink-0"
                            style={{ color: `${T.stone}80` }}>
                            {i + 1}
                          </span>
                          {/* Bar + label */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between mb-1.5">
                              <span className={`font-${isLargest ? "extrabold" : "semibold"} text-gray-900 truncate mr-3 ${isLargest ? "text-base" : "text-sm"}`}>
                                {fn}
                              </span>
                              <span className={`tabular-nums flex-shrink-0 font-bold ${isLargest ? "text-base" : "text-sm"}`}
                                style={{ color: T.green }}>
                                {abbreviateCurrency(amt)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: T.chart[i % T.chart.length],
                                  }} />
                              </div>
                              <span className="text-xs font-semibold w-10 text-right flex-shrink-0"
                                style={{ color: T.stone }}>
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {topFunctions.length > 7 && (
                      <div className="px-4 py-2">
                        <Link href={`/${slug}/expenses`}
                          className="text-xs font-semibold flex items-center gap-1 hover:gap-2 transition-all"
                          style={{ color }}>
                          +{topFunctions.length - 7} more function areas
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                          </svg>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </section>
      )}

      <Rule />

      {/* ══════════════════════════════════════════════════════
          4. BALANCED BUDGET — revenue vs expense
      ══════════════════════════════════════════════════════ */}
      {hasData && totalRevenues > 0 && (
        <section className="py-16 px-4 sm:px-6 -mx-4 sm:-mx-6 bg-white" aria-label="Budget balance">
          <Section>
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-10">
                <Eyebrow>Fiscal health</Eyebrow>
                <h2 className="text-3xl font-extrabold tracking-tight" style={{ color: T.green }}>
                  A Balanced Budget
                </h2>
                <p className="text-gray-500 mt-2 text-sm max-w-md mx-auto">
                  {siteText.balanceSubtext}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Revenue */}
                <div className="border border-gray-100 rounded-2xl p-6" style={{ backgroundColor: T.cream }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: T.sage }} />
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Revenue</p>
                  </div>
                  <p className="text-4xl font-extrabold tabular-nums mb-4" style={{ color: T.sage }}>
                    {abbreviateCurrency(totalRevenues)}
                  </p>
                  <div className="space-y-2">
                    {topRevenues.slice(0, 4).map(([cat, amt]) => {
                      const pct = totalRevenues > 0 ? (amt / totalRevenues) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600 truncate mr-2">{cat}</span>
                            <span className="font-semibold text-gray-800 flex-shrink-0 tabular-nums">{abbreviateCurrency(amt)}</span>
                          </div>
                          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: T.sage }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-2">
                      <Link href={`/${slug}/revenues`}
                        className="text-xs font-bold flex items-center gap-1 hover:gap-2 transition-all"
                        style={{ color: T.sage }}>
                        View all revenue sources →
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Balance indicator */}
                <div className="flex flex-col items-center justify-center text-center p-8">
                  <div className="w-24 h-24 rounded-full border-4 flex items-center justify-center mb-4"
                    style={{ borderColor: balance >= 0 ? T.sage : "#DC2626" }}>
                    <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
                      style={{ color: balance >= 0 ? T.sage : "#DC2626" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-600 mb-1">
                    {balance >= 0 ? "Balanced" : "Deficit"}
                  </p>
                  <p className="text-2xl font-extrabold tabular-nums" style={{ color: balance >= 0 ? T.sage : "#DC2626" }}>
                    {balance >= 0 ? "✓" : "△"} {abbreviateCurrency(Math.abs(balance))}
                  </p>
                  <p className="text-xs text-gray-400 mt-2 max-w-[140px] leading-snug">
                    {balance >= 0
                      ? "Revenue exceeds expenses in the adopted budget"
                      : "Budget shows a projected gap"}
                  </p>
                </div>

                {/* Expenses */}
                <div className="border border-gray-100 rounded-2xl p-6" style={{ backgroundColor: T.cream }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: T.slate }} />
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Expenses</p>
                  </div>
                  <p className="text-4xl font-extrabold tabular-nums mb-4" style={{ color: T.slate }}>
                    {abbreviateCurrency(totalExpenses)}
                  </p>
                  <div className="space-y-2">
                    {topFunctions.slice(0, 4).map(([fn, amt]) => {
                      const pct = totalExpenses > 0 ? (amt / totalExpenses) * 100 : 0;
                      return (
                        <div key={fn}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-600 truncate mr-2">{fn}</span>
                            <span className="font-semibold text-gray-800 flex-shrink-0 tabular-nums">{abbreviateCurrency(amt)}</span>
                          </div>
                          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: T.slate }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-2">
                      <Link href={`/${slug}/expenses`}
                        className="text-xs font-bold flex items-center gap-1 hover:gap-2 transition-all"
                        style={{ color: T.slate }}>
                        View all expense detail →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </section>
      )}

      <Rule />

      {/* ══════════════════════════════════════════════════════
          5. CAPITAL PROJECTS SPOTLIGHT
      ══════════════════════════════════════════════════════ */}
      {totalCapital > 0 && (
        <section className="py-16 px-4 sm:px-6 -mx-4 sm:-mx-6 overflow-hidden" aria-label="Capital projects">
          <Section>
            <div className="max-w-7xl mx-auto">
              <div className="rounded-2xl overflow-hidden relative" style={{ backgroundColor: T.green }}>
                {/* Decorative background element */}
                <div className="absolute inset-0 opacity-[0.06]">
                  <svg className="w-full h-full" viewBox="0 0 800 400" aria-hidden="true">
                    <polygon points="600,0 800,0 800,400 400,400" fill="white"/>
                    <circle cx="700" cy="200" r="150" fill="none" stroke="white" strokeWidth="1"/>
                    <circle cx="700" cy="200" r="100" fill="none" stroke="white" strokeWidth="1"/>
                    <circle cx="700" cy="200" r="50" fill="none" stroke="white" strokeWidth="1"/>
                  </svg>
                </div>

                <div className="relative p-8 lg:p-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: T.gold2 }}>
                      Capital Investment Plan
                    </p>
                    <h2 className="text-4xl font-extrabold text-white tracking-tight mb-4 leading-tight">
                      {siteText.capitalTitle}
                    </h2>
                    <p className="text-white/65 text-sm leading-relaxed mb-6">
                      {siteText.capitalBody}
                    </p>
                    <div className="flex items-baseline gap-3 mb-6">
                      <span className="text-5xl font-extrabold text-white tabular-nums">
                        {abbreviateCurrency(totalCapital)}
                      </span>
                      <div>
                        <p className="text-white/50 text-xs uppercase tracking-wider font-semibold">FY{latestCapYear}</p>
                        <p className="text-white/50 text-xs">Capital Investment</p>
                      </div>
                    </div>
                    <Link href={`/${slug}/capital`}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all hover:scale-105"
                      style={{ backgroundColor: T.gold2, color: "#1a1a1a" }}>
                      Explore Capital Plan
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                      </svg>
                    </Link>
                  </div>

                  {/* Project dept cards */}
                  <div className="space-y-3">
                    {topCapDepts.map(([dept, amt], i) => (
                      <div key={dept}
                        className="flex items-center justify-between p-4 rounded-xl border border-white/10"
                        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: [T.gold2, T.sage2, "#a78bfa"][i] }} />
                          <span className="text-white font-semibold text-sm">{dept}</span>
                        </div>
                        <span className="text-white/80 font-bold tabular-nums text-sm">{abbreviateCurrency(amt)}</span>
                      </div>
                    ))}
                    <div className="text-center pt-2">
                      <Link href={`/${slug}/capital`}
                        className="text-xs font-bold flex items-center justify-center gap-1 hover:gap-2 transition-all"
                        style={{ color: T.gold2 }}>
                        View all projects →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </section>
      )}

      <Rule />

      {/* ══════════════════════════════════════════════════════
          6. DOCUMENT LIBRARY
      ══════════════════════════════════════════════════════ */}
      <section className="py-16 px-4 sm:px-6 -mx-4 sm:-mx-6 bg-white" aria-label="Documents">
        <Section>
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-8">
              <Eyebrow>Transparency</Eyebrow>
              <h2 className="text-3xl font-extrabold tracking-tight" style={{ color: T.green }}>
                {siteText.docsTitle}
              </h2>
              <p className="text-gray-500 mt-2 text-sm">
                {siteText.docsSubtext}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  href: `/${slug}/budget-book`,
                  title: "Budget Book",
                  desc: "Complete FY" + expYear + " adopted budget with departmental detail and narratives.",
                  icon: "📖",
                },
                {
                  href: `/${slug}/documents`,
                  title: "Financial Documents",
                  desc: "Annual reports, audits, and supplementary financial information.",
                  icon: "📄",
                },
                {
                  href: `/${slug}/capital`,
                  title: "Capital Plan",
                  desc: "Multi-year capital improvement plan and project investments.",
                  icon: "🏗️",
                },
                {
                  href: `/${slug}/expenses`,
                  title: "Department Budgets",
                  desc: "Line-item detail for all departments and function areas.",
                  icon: "📊",
                },
                {
                  href: `/${slug}/revenues`,
                  title: "Revenue Summary",
                  desc: "Full breakdown of how the Town funds its operations.",
                  icon: "💰",
                },
                {
                  href: `/${slug}/faq`,
                  title: "FAQ",
                  desc: "Answers to common questions about the Town's budget and OpenBook.",
                  icon: "❓",
                },
              ].map(item => (
                <Link key={item.href} href={item.href}
                  className="group flex items-start gap-4 p-5 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/60 hover:shadow-sm transition-all">
                  <span className="text-2xl flex-shrink-0 mt-0.5">{item.icon}</span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 group-hover:text-opacity-80 mb-0.5 flex items-center gap-1.5">
                      {item.title}
                      <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                      </svg>
                    </h3>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </Section>
      </section>

      {/* ══════════════════════════════════════════════════════
          7. CONTACT / SNAPSHOT strip
      ══════════════════════════════════════════════════════ */}
      {(town.contactEmail || hasData) && (
        <section className="py-10 px-4 sm:px-6 -mx-4 sm:-mx-6 border-t border-gray-100" style={{ backgroundColor: T.cream }}
          aria-label="Contact and summary">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            {hasData && (
              <div className="flex flex-wrap gap-6">
                {[
                  { label: "Operating Budget", value: formatCurrency(totalExpenses) },
                  ...(totalRevenues > 0 ? [{ label: "Total Revenue", value: formatCurrency(totalRevenues) }] : []),
                  { label: "Fiscal Year", value: `FY${expYear}` },
                  { label: "Line Items", value: lineItemCount.toLocaleString() },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400">{item.label}</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: T.green }}>{item.value}</p>
                  </div>
                ))}
              </div>
            )}
            {town.contactEmail && (
              <div className="flex-shrink-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-1">Questions?</p>
                <a href={`mailto:${town.contactEmail}`}
                  className="text-sm font-semibold hover:underline"
                  style={{ color }}>
                  {town.contactEmail}
                </a>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
