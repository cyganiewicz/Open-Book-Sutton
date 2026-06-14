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
  sourceColorFn: string; // serialized fn — we'll re-implement inline
}

function sourceColor(s: string): string {
  const sl = s.toLowerCase();
  if (sl.includes("free cash")) return "#059669";
  if (sl.includes("borrow")) return "#4f46e5";
  if (sl.includes("stabiliz")) return "#d97706";
  if (sl.includes("grant")) return "#0891b2";
  return "#6b7280";
}

function ProjectCard({ project, yearTotal, color }: {
  project: Project;
  yearTotal: number;
  color: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = yearTotal > 0 ? (project.amount / yearTotal * 100) : 0;
  const sc = project.fundingSource ? sourceColor(project.fundingSource) : "#9ca3af";

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden hover:border-gray-200 transition-colors">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50/60 transition-colors"
      >
        {/* Amount pill */}
        <span className="text-sm font-bold text-gray-900 tabular-nums w-20 flex-shrink-0">
          {abbreviateCurrency(project.amount)}
        </span>

        {/* Purpose + dept */}
        <span className="flex-1 min-w-0 text-left">
          <span className="text-sm font-medium text-gray-800 block truncate">{project.purpose}</span>
          {project.department && (
            <span className="text-xs text-gray-400">{project.department}</span>
          )}
        </span>

        {/* Funding badge */}
        {project.fundingSource && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
            style={{ backgroundColor: sc + "18", color: sc }}>
            {project.fundingSource}
          </span>
        )}

        {/* Percent */}
        <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">{pct.toFixed(1)}%</span>

        {/* Expand indicator - only shown if there's something to expand */}
        {(project.description || project.fundingSource) && (
          <span className="text-gray-300 text-sm flex-shrink-0 transition-transform duration-150"
            style={{ display: "inline-block", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
            ▾
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-50 bg-gray-50/40">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-600">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Amount</p>
              <p className="font-bold text-gray-900">{formatCurrency(project.amount)}</p>
            </div>
            {project.department && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Department</p>
                <p className="font-medium">{project.department}</p>
              </div>
            )}
            {project.fundingSource && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Funding Source</p>
                <p className="font-medium" style={{ color: sc }}>{project.fundingSource}</p>
              </div>
            )}
          </div>
          {project.description && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Description</p>
              <p className="text-sm text-gray-700 leading-relaxed">{project.description}</p>
            </div>
          )}
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
              <span>{pct.toFixed(1)}% of year total</span>
              <span>{formatCurrency(yearTotal)} total</span>
            </div>
            <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CapitalProjectList({ projectsByYear, color, deptColors }: CapitalProjectListProps) {
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());

  const toggleYear = (year: string) =>
    setCollapsedYears(prev => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });

  return (
    <div className="space-y-4">
      {projectsByYear.map(({ year, projects }) => {
        const yearTotal = projects.reduce((s, p) => s + p.amount, 0);
        const isCollapsed = collapsedYears.has(year);

        return (
          <div key={year} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Year header */}
            <button
              onClick={() => toggleYear(year)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors border-b border-gray-100"
            >
              <div className="flex items-center gap-3">
                <span className="text-base font-extrabold" style={{ color }}>FY{year}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {projects.length} project{projects.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-base font-bold text-gray-900 tabular-nums">{abbreviateCurrency(yearTotal)}</span>
                <span className="text-gray-300 text-sm transition-transform duration-150"
                  style={{ display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
              </div>
            </button>

            {/* Projects */}
            {!isCollapsed && (
              <div className="p-3 space-y-1.5">
                {projects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    yearTotal={yearTotal}
                    color={color}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
