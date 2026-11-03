// "Looking ahead": department requests for future years, shown without bars or charts.
// Requests are estimates under review, so they get their own calm section instead of
// sharing a vertical chart with funded money (where one large project flattens everything).

import type { PublicSummary } from "@/lib/capital/public";
import { abbreviateCurrency } from "@/lib/format";

export interface OutlookRow { code: string; title: string; department: string; byYear: Record<string, number>; total: number; fundedNote: string | null }

export function buildOutlook(projects: PublicSummary[], adopted: string) {
  const rows: OutlookRow[] = projects.flatMap(p => {
    const byYear: Record<string, number> = {};
    for (const y of p.years) if (y.fiscalYear > adopted && y.approved === null && y.requested > 0) byYear[y.fiscalYear] = y.requested;
    const total = Object.values(byYear).reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    const funded = p.years.filter(y => y.approved !== null).map(y => y.fiscalYear).sort();
    return [{ code: p.code, title: p.title, department: p.department, byYear, total, fundedNote: funded.length ? `Also funded in FY${funded[funded.length - 1]}` : null }];
  });
  const years = [...new Set(rows.flatMap(r => Object.keys(r.byYear)))].sort();
  const tiles = years.map(y => ({ year: y, count: rows.filter(r => r.byYear[y]).length, total: rows.reduce((s, r) => s + (r.byYear[y] ?? 0), 0) }));
  const map = new Map<string, OutlookRow[]>();
  for (const r of rows) map.set(r.department, [...(map.get(r.department) ?? []), r]);
  const groups = [...map].map(([department, rs]) => ({
    department, count: rs.length, total: rs.reduce((s, r) => s + r.total, 0),
    rows: rs.sort((a, b) => (Object.keys(a.byYear).sort()[0] ?? "").localeCompare(Object.keys(b.byYear).sort()[0] ?? "") || a.title.localeCompare(b.title)),
  })).sort((a, b) => a.department.localeCompare(b.department));
  return { rows, years, tiles, groups, total: rows.reduce((s, r) => s + r.total, 0) };
}

export default function CapitalOutlook({ projects, adoptedFY, townSlug, color }: { projects: PublicSummary[]; adoptedFY: string; townSlug: string; color: string }) {
  const o = buildOutlook(projects, adoptedFY);
  if (o.rows.length === 0) return null;
  const first = o.years[0], last = o.years[o.years.length - 1];
  return (
    <section id="looking-ahead" aria-labelledby="looking-ahead-h" className="space-y-5 pt-2">
      <style>{`.la-group[open] .la-chevron{transform:rotate(90deg)} .la-group>summary{list-style:none} .la-group>summary::-webkit-details-marker{display:none}`}</style>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Looking ahead</p>
        <h2 id="looking-ahead-h" className="text-2xl font-bold text-gray-900" style={{ fontFamily: "var(--font-display)" }}>
          Projects departments have requested for FY{first}{last !== first ? `–FY${last}` : ""}
        </h2>
        <p className="text-sm text-gray-500 max-w-3xl mt-1.5 leading-relaxed">
          These are department requests under review. They are <strong className="text-gray-700">not funded</strong> and are not a commitment of Town funds.
          Each request is evaluated and, if recommended, goes to Town Meeting for approval. Amounts are the departments&apos; estimates and may change.
        </p>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" aria-label="Requests by fiscal year">
        {o.tiles.map(t => (
          <li key={t.year} className="rounded-xl border border-gray-200 bg-white px-4 py-3" style={{ borderTop: `3px solid ${color}` }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">FY{t.year}</p>
            <p className="text-xl font-bold tabular-nums text-gray-900">{abbreviateCurrency(t.total)}</p>
            <p className="text-xs text-gray-500">{t.count} request{t.count === 1 ? "" : "s"}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        {o.groups.map(g => (
          <details key={g.department} className="la-group rounded-xl border border-gray-200 bg-white overflow-hidden">
            <summary className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 cursor-pointer select-none hover:bg-gray-50">
              <span aria-hidden="true" className="la-chevron text-gray-400 text-xs" style={{ display: "inline-block", transition: "transform .15s" }}>▶</span>
              <span className="font-semibold text-gray-900">{g.department}</span>
              <span className="text-sm text-gray-500">{g.count} request{g.count === 1 ? "" : "s"}</span>
              <span className="flex-1" />
              <span className="font-semibold tabular-nums text-gray-800">{abbreviateCurrency(g.total)}</span>
            </summary>
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-sm" style={{ minWidth: 560 }}>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                    <th scope="col" className="px-5 py-2 font-semibold">Project</th>
                    {o.years.map(y => <th scope="col" key={y} className="px-2 py-2 font-semibold text-right">FY{y}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map(r => (
                    <tr key={r.code} className="border-t border-gray-100">
                      <td className="px-5 py-2.5">
                        <a href={`/${townSlug}/capital/${r.code}`} className="font-medium underline-offset-2 hover:underline" style={{ color }}>{r.title}</a>
                        {r.fundedNote && <p className="text-xs text-gray-400">{r.fundedNote}</p>}
                      </td>
                      {o.years.map(y => (
                        <td key={y} className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {r.byYear[y] ? <span className="font-semibold text-gray-900">{abbreviateCurrency(r.byYear[y])}</span> : <span className="text-gray-300" aria-label="none">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
