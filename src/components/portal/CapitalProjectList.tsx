"use client";

import { useState } from "react";
import { abbreviateCurrency, formatCurrency } from "@/lib/format";

interface Project {
  id: string;
  purpose: string;
  department: string | null;
  amount: number;
  fundingSource: string | null;
  description: string | null;
}

interface YearGroup {
  year: string;
  projects: Project[];
}

interface CapitalProjectListProps {
  projectsByYear: YearGroup[];
  color: string;
  deptColors: string[];
  sourceColorFn: string;
}

function sourceColor(s: string): string {
  const sl = s.toLowerCase();
  if (sl.includes("free cash")) return "#40916c";
  if (sl.includes("borrow")) return "#1e6091";
  if (sl.includes("stabiliz")) return "#d97706";
  if (sl.includes("grant")) return "#0891b2";
  return "#6b7280";
}

function ProjectRow({
  project,
  yearTotal,
  color,
  rank,
}: {
  project: Project;
  yearTotal: number;
  color: string;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = yearTotal > 0 ? (project.amount / yearTotal) * 100 : 0;
  const sc = project.fundingSource ? sourceColor(project.fundingSource) : "#9ca3af";
  const hasDetail = !!(project.description || project.fundingSource);

  return (
    <div
      className={`border-b border-gray-100 last:border-b-0 transition-colors ${
        expanded ? "bg-gray-50/60" : "hover:bg-gray-50/40"
      }`}
    >
      <button
        onClick={() => hasDetail && setExpanded((e: boolean) => !e)}
        className={`w-full text-left px-5 py-3 flex items-center gap-4 ${
          hasDetail ? "cursor-pointer" : "cursor-default"
        }`}
        aria-expanded={hasDetail ? expanded : undefined}
      >
        {/* Rank */}
        <span className="text-[11px] font-bold text-gray-300 w-5 text-right flex-shrink-0 tabular-nums">
          {rank}
        </span>

        {/* Amount — financial anchor */}
        <span
          className="text-sm font-bold tabular-nums flex-shrink-0 w-20 text-right"
          style={{ color }}
        >
          {abbreviateCurrency(project.amount)}
        </span>

        {/* Purpose + dept */}
        <span className="flex-1 min-w-0 text-left">
          <span className="text-sm font-semibold text-gray-800 block leading-snug">
            {project.purpose}
          </span>
          {project.department && (
            <span className="text-xs text-gray-400">{project.department}</span>
          )}
        </span>

        {/* Funding badge */}
        {project.fundingSource && (
          <span
            className="hidden sm:inline-flex items-center text-[11px] px-2 py-0.5 rounded font-semibold flex-shrink-0"
            style={{
              backgroundColor: sc + "18",
              color: sc,
              border: `1px solid ${sc}30`,
            }}
          >
            {project.fundingSource}
          </span>
        )}

        {/* Percent of year */}
        <span className="text-xs text-gray-400 w-12 text-right flex-shrink-0 tabular-nums">
          {pct.toFixed(1)}%
        </span>

        {/* Expand indicator */}
        {hasDetail && (
          <span
            className="text-gray-300 text-sm flex-shrink-0 transition-transform duration-150"
            style={{
              display: "inline-block",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            }}
            aria-hidden
          >
            ▾
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-4 pt-1">
          <div className="ml-9 border-t border-gray-100 pt-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Full Amount</p>
                <p className="font-bold text-gray-900 tabular-nums">{formatCurrency(project.amount)}</p>
              </div>
              {project.department && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Department</p>
                  <p className="font-medium text-gray-700">{project.department}</p>
                </div>
              )}
              {project.fundingSource && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Funding Source</p>
                  <p className="font-semibold" style={{ color: sc }}>{project.fundingSource}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">Share of Year</p>
                <p className="font-medium text-gray-700">{pct.toFixed(1)}%</p>
              </div>
            </div>
            {project.description && (
              <p className="text-sm text-gray-600 leading-relaxed">{project.description}</p>
            )}
            {/* Mini progress bar */}
            <div className="mt-3 h-1 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CapitalProjectList({
  projectsByYear,
  color,
}: CapitalProjectListProps) {
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());

  const toggleYear = (year: string) =>
    setCollapsedYears(prev => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-lg font-bold text-gray-900"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Capital Project Portfolio
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            All projects organized by fiscal year — click any row to expand detail
          </p>
        </div>
      </div>

      {projectsByYear.map(({ year, projects }) => {
        const yearTotal = projects.reduce((s, p) => s + p.amount, 0);
        const isCollapsed = collapsedYears.has(year);

        return (
          <div
            key={year}
            className="bg-white border border-gray-200/60 rounded-xl overflow-hidden shadow-sm"
          >
            {/* Year header */}
            <button
              onClick={() => toggleYear(year)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors border-b border-gray-100"
              aria-expanded={!isCollapsed}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-lg font-extrabold tabular-nums"
                  style={{ color, fontFamily: "var(--font-display)" }}
                >
                  FY{year}
                </span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                  {projects.length} project{projects.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-base font-bold text-gray-900 tabular-nums">
                  {abbreviateCurrency(yearTotal)}
                </span>
                <span
                  className="text-gray-300 text-sm transition-transform duration-150"
                  style={{
                    display: "inline-block",
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  }}
                  aria-hidden
                >
                  ▾
                </span>
              </div>
            </button>

            {/* Column headers when expanded */}
            {!isCollapsed && (
              <>
                <div className="hidden sm:flex items-center gap-4 px-5 py-2 bg-gray-50/50 border-b border-gray-100">
                  <span className="w-5 flex-shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-20 text-right flex-shrink-0">
                    Amount
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex-1">
                    Project / Department
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hidden sm:block w-28 flex-shrink-0">
                    Funding Source
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 w-12 text-right flex-shrink-0">
                    Share
                  </span>
                  <span className="w-4 flex-shrink-0" />
                </div>

                <div>
                  {projects.map((project, idx) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      yearTotal={yearTotal}
                      color={color}
                      rank={idx + 1}
                    />
                  ))}
                </div>

                {/* Year totals footer */}
                <div className="flex items-center gap-4 px-5 py-3 bg-gray-50/70 border-t border-gray-100">
                  <span className="w-5 flex-shrink-0" />
                  <span className="text-sm font-bold tabular-nums w-20 text-right flex-shrink-0" style={{ color }}>
                    {abbreviateCurrency(yearTotal)}
                  </span>
                  <span className="flex-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    FY{year} Total
                  </span>
                  <span className="text-xs text-gray-400 w-12 text-right flex-shrink-0 tabular-nums">100%</span>
                  <span className="w-4 flex-shrink-0" />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
