"use client";

import { useState, useEffect } from "react";
import HelpBox from "@/components/admin/HelpBox";
import {
  type AccountCodeConfig,
  type RevenueCodeConfig,
  type AccountSegment,
  type CodeEntry,
  type HierarchyLevel,
  type SortOrder,
  type GroupField,
  SORT_LABELS,
  GROUP_FIELD_LABELS,
  DEFAULT_EXPENSE_LEVELS,
  DEFAULT_REVENUE_LEVELS,
  emptyConfig,
  parseAccountCodeConfig,
  detectAccountStructure,
  applyAccountCodeConfig,
  resolveRevenueCategory,
  getCoveredFields,
} from "@/lib/account-codes";

// ── Helpers ────────────────────────────────────────────────────────────────

function blankSegment(index: number): AccountSegment {
  return { index, name: "", prefixLength: 0, codes: [] };
}

const MA_MUNIS_PRESETS: CodeEntry[] = [
  { code: "51", label: "51xxx — Salaries",           group: "Salaries & Wages" },
  { code: "52", label: "52xxx — Purchased Services",  group: "Purchased Services" },
  { code: "53", label: "53xxx — Purchased Services",  group: "Purchased Services" },
  { code: "54", label: "54xxx — Supplies",            group: "Supplies & Materials" },
  { code: "55", label: "55xxx — Supplies",            group: "Supplies & Materials" },
  { code: "56", label: "56xxx — Intergovernmental",   group: "Intergovernmental" },
  { code: "57", label: "57xxx — Other Charges",       group: "Other Charges & Expenses" },
  { code: "58", label: "58xxx — Capital Outlay",      group: "Capital Outlay" },
  { code: "59", label: "59xxx — Debt Service",        group: "Debt Service" },
  ];

const SORT_OPTIONS: SortOrder[] = ["total_desc","total_asc","alpha_asc","alpha_desc"];

// ── Component ──────────────────────────────────────────────────────────────

export default function AccountCodesPage() {
  const [townId, setTownId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok"|"err"; text: string } | null>(null);

  const [config, setConfig] = useState<AccountCodeConfig>(emptyConfig());
  const [activeSegIdx, setActiveSegIdx] = useState<number | null>(null);

  // Step 1
  const [sampleInput, setSampleInput] = useState("");
  const [detected, setDetected] = useState<{ separator: string; segmentCount: number; samples: string[][] } | null>(null);

  // Preview
  const [previewCode, setPreviewCode] = useState("");
  const [previewDept, setPreviewDept] = useState("");
  const [previewResult, setPreviewResult] = useState<{ functionArea: string|null; department: string|null; category1: string|null; category2: string|null }|null>(null);
  const [revPreviewCode, setRevPreviewCode] = useState("");
  const [revPreviewResult, setRevPreviewResult] = useState<{ category1: string|null; category2: string|null }|null>(null);

  // Tab
  const [tab, setTab] = useState<"segments"|"revenue-segments"|"organization">("segments");

  useEffect(() => {
    fetch("/api/towns").then(r => r.json()).then(towns => {
      if (towns.length > 0) {
        setTownId(towns[0].id);
        const parsed = parseAccountCodeConfig(towns[0].accountCodeRules || "");
        if (parsed) setConfig(parsed);
      }
    }).catch(() => setMsg({ type:"err", text:"Failed to load" }))
      .finally(() => setLoading(false));
  }, []);

  // ── Mutators ──────────────────────────────────────────────────────────────

  const upd = (patch: Partial<AccountCodeConfig>) => setConfig(c => ({ ...c, ...patch }));

  const updSeg = (idx: number, patch: Partial<AccountSegment>) =>
    setConfig(c => ({ ...c, segments: c.segments.map(s => s.index === idx ? { ...s, ...patch } : s) }));

  const addSegment = (index: number) => {
    if (config.segments.find(s => s.index === index)) { setActiveSegIdx(index); return; }
    setConfig(c => ({ ...c, segments: [...c.segments, blankSegment(index)].sort((a,b) => a.index - b.index) }));
    setActiveSegIdx(index);
  };

  const removeSegment = (index: number) => {
    setConfig(c => ({
      ...c,
      segments: c.segments.filter(s => s.index !== index),
      functionAreaSegment: c.functionAreaSegment === index ? null : c.functionAreaSegment,
      departmentSegment: c.departmentSegment === index ? null : c.departmentSegment,
      spendingTypeSegment: c.spendingTypeSegment === index ? null : c.spendingTypeSegment,
      subcategorySegment: c.subcategorySegment === index ? null : c.subcategorySegment,
    }));
    if (activeSegIdx === index) setActiveSegIdx(null);
  };

  const addCode = (segIdx: number, code: string, label: string, group: string) => {
    if (!code) return;
    const seg = config.segments.find(s => s.index === segIdx);
    if (!seg) return;
    updSeg(segIdx, {
      codes: [...seg.codes.filter(c => c.code !== code), { code, label: label||code, ...(group?{group}:{}) }]
        .sort((a,b) => a.code.localeCompare(b.code)),
    });
  };

  // Bulk version — adds all entries in a single state update to avoid stale closure
  const addCodes = (segIdx: number, entries: Array<{ code: string; label: string; group: string }>) => {
    if (!entries.length) return;
    setConfig(c => ({
      ...c,
      segments: c.segments.map(s => {
        if (s.index !== segIdx) return s;
        const existing = new Map(s.codes.map(e => [e.code, e]));
        for (const entry of entries) {
          if (!entry.code) continue;
          existing.set(entry.code, {
            code: entry.code,
            label: entry.label || entry.code,
            ...(entry.group ? { group: entry.group } : {}),
          });
        }
        return {
          ...s,
          codes: [...existing.values()].sort((a, b) => a.code.localeCompare(b.code)),
        };
      }),
    }));
  };

  const removeCode = (segIdx: number, code: string) => {
    const seg = config.segments.find(s => s.index === segIdx);
    if (!seg) return;
    updSeg(segIdx, { codes: seg.codes.filter(c => c.code !== code) });
  };

  const updCode = (segIdx: number, code: string, patch: Partial<CodeEntry>) => {
    const seg = config.segments.find(s => s.index === segIdx);
    if (!seg) return;
    updSeg(segIdx, { codes: seg.codes.map(c => c.code === code ? { ...c, ...patch } : c) });
  };

  const updLevel = (kind: "expenseLevels"|"revenueLevels", idx: number, patch: Partial<HierarchyLevel>) => {
    setConfig(c => ({
      ...c,
      portalOrganization: {
        expenseLevels: c.portalOrganization?.expenseLevels ?? DEFAULT_EXPENSE_LEVELS,
        revenueLevels: c.portalOrganization?.revenueLevels ?? DEFAULT_REVENUE_LEVELS,
        [kind]: (c.portalOrganization?.[kind] ?? (kind==="expenseLevels" ? DEFAULT_EXPENSE_LEVELS : DEFAULT_REVENUE_LEVELS))
          .map((l, i) => i === idx ? { ...l, ...patch } : l),
      },
    }));
  };

  // ── Revenue config mutators ──────────────────────────────────────────────
  const updRevConfig = (patch: Partial<RevenueCodeConfig>) =>
    setConfig(c => ({ ...c, revenueConfig: { ...( c.revenueConfig ?? { separator: "-", segments: [], categorySegment: null, subcategorySegment: null }), ...patch } }));

  const updRevSeg = (idx: number, patch: Partial<AccountSegment>) =>
    setConfig(c => ({
      ...c,
      revenueConfig: {
        ...(c.revenueConfig ?? { separator: "-", segments: [], categorySegment: null, subcategorySegment: null }),
        segments: (c.revenueConfig?.segments ?? []).map(s => s.index === idx ? { ...s, ...patch } : s),
      }
    }));

  const addRevSegment = (index: number) => {
    const existing = config.revenueConfig?.segments ?? [];
    if (existing.find(s => s.index === index)) return;
    setConfig(c => ({
      ...c,
      revenueConfig: {
        ...(c.revenueConfig ?? { separator: "-", segments: [], categorySegment: null, subcategorySegment: null }),
        segments: [...existing, blankSegment(index)].sort((a,b) => a.index - b.index),
      }
    }));
  };

  const addRevCodes = (segIdx: number, entries: Array<{ code: string; label: string; group: string }>) => {
    if (!entries.length) return;
    setConfig(c => ({
      ...c,
      revenueConfig: {
        ...(c.revenueConfig ?? { separator: "-", segments: [], categorySegment: null, subcategorySegment: null }),
        segments: (c.revenueConfig?.segments ?? []).map(s => {
          if (s.index !== segIdx) return s;
          const existing = new Map(s.codes.map(e => [e.code, e]));
          for (const entry of entries) {
            if (!entry.code) continue;
            existing.set(entry.code, { code: entry.code, label: entry.label || entry.code, ...(entry.group ? { group: entry.group } : {}) });
          }
          return { ...s, codes: [...existing.values()].sort((a,b) => a.code.localeCompare(b.code)) };
        }),
      }
    }));
  };

  const handleRevPreview = () => {
    const result = resolveRevenueCategory(revPreviewCode || null, config.revenueConfig ?? null);
    setRevPreviewResult(result);
  };

  const [activeRevSegIdx, setActiveRevSegIdx] = useState<number | null>(null);
  const activeRevSeg = activeRevSegIdx !== null ? (config.revenueConfig?.segments ?? []).find(s => s.index === activeRevSegIdx) : null;

  const addLevel = (kind: "expenseLevels"|"revenueLevels") => {
    setConfig(c => ({
      ...c,
      portalOrganization: {
        expenseLevels: c.portalOrganization?.expenseLevels ?? DEFAULT_EXPENSE_LEVELS,
        revenueLevels: c.portalOrganization?.revenueLevels ?? DEFAULT_REVENUE_LEVELS,
        [kind]: [...(c.portalOrganization?.[kind] ?? []), { dataField: "category1" as GroupField, name: "", sort: "total_desc" as SortOrder, skipIfEmpty: true }],
      },
    }));
  };

  const removeLevel = (kind: "expenseLevels"|"revenueLevels", idx: number) => {
    setConfig(c => ({
      ...c,
      portalOrganization: {
        expenseLevels: c.portalOrganization?.expenseLevels ?? DEFAULT_EXPENSE_LEVELS,
        revenueLevels: c.portalOrganization?.revenueLevels ?? DEFAULT_REVENUE_LEVELS,
        [kind]: (c.portalOrganization?.[kind] ?? []).filter((_, i) => i !== idx),
      },
    }));
  };

  const moveLevel = (kind: "expenseLevels"|"revenueLevels", idx: number, dir: -1|1) => {
    setConfig(c => {
      const arr = [...(c.portalOrganization?.[kind] ?? [])];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return c;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...c, portalOrganization: { expenseLevels: c.portalOrganization?.expenseLevels ?? DEFAULT_EXPENSE_LEVELS, revenueLevels: c.portalOrganization?.revenueLevels ?? DEFAULT_REVENUE_LEVELS, [kind]: arr } };
    });
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleDetect = () => {
    const codes = sampleInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!codes.length) return;
    const result = detectAccountStructure(codes);
    setDetected(result);
    upd({ separator: result.separator });
  };

  const handlePreview = () => {
    const result = applyAccountCodeConfig(previewCode||null, previewDept||null, config);
    setPreviewResult(result);
  };

  const handleSave = async () => {
    if (!townId) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/towns/${townId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountCodeRules: JSON.stringify(config) }),
      });
      if (!res.ok) throw new Error("Save failed");
      setMsg({ type:"ok", text:"Saved! Rules apply to all future uploads." });
    } catch(e) {
      setMsg({ type:"err", text: e instanceof Error ? e.message : "Save failed" });
    } finally { setSaving(false); }
  };

  const handleClear = async () => {
    if (!townId || !confirm("Remove all account code rules?")) return;
    await fetch(`/api/towns/${townId}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ accountCodeRules:"" }) });
    setConfig(emptyConfig());
    setMsg({ type:"ok", text:"Rules cleared." });
  };

  const loadMuniPresets = (segIdx: number) => {
    const seg = config.segments.find(s => s.index === segIdx);
    if (!seg) return;
    const existing = new Set(seg.codes.map(c => c.code));
    const toAdd = MA_MUNIS_PRESETS.filter(p => !existing.has(p.code));
    updSeg(segIdx, { codes: [...seg.codes, ...toAdd].sort((a,b) => a.code.localeCompare(b.code)), prefixLength: seg.prefixLength || 2 });
  };

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;

  const activeSeg = activeSegIdx !== null ? config.segments.find(s => s.index === activeSegIdx) : null;
  const segCount = detected?.segmentCount ?? Math.max(...config.segments.map(s => s.index + 1), 0);
  const po = config.portalOrganization ?? { expenseLevels: DEFAULT_EXPENSE_LEVELS, revenueLevels: DEFAULT_REVENUE_LEVELS };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Account Code Dictionary</h1>
        <p className="text-sm text-gray-500 mt-1">Define your account structure, group codes into categories, and control how the portal organizes and sorts data.</p>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm border flex items-center justify-between ${msg.type==="ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          <span>{msg.text}</span>
          {msg.type==="ok" && <button onClick={handleClear} className="text-xs underline opacity-60 hover:opacity-100 ml-4">Clear all rules</button>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          ["segments", "Expense Segments"],
          ["revenue-segments", "Revenue Segments"],
          ["organization", "Portal Organization"],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab===t ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: Segments ── */}
      {tab === "segments" && (
        <div className="space-y-6">

          {/* Step 1: Detect */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Step 1 — Detect account structure</h2>
            <textarea value={sampleInput} onChange={e => setSampleInput(e.target.value)} rows={3}
              placeholder={"0001-300-300-2210-00-1-00-51110\n0001-100-113-0000-00-0-00-57300"}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleDetect} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Detect structure</button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Separator:</label>
                <input type="text" value={config.separator} onChange={e => upd({ separator: e.target.value })}
                  className="w-12 border border-gray-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {detected && (
              <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                <p className="text-xs font-medium text-gray-600 mb-2">
                  Separator: <code className="bg-gray-200 px-1 rounded">{detected.separator}</code>
                  &ensp;·&ensp; {detected.segmentCount} segments
                </p>
                <table className="text-xs font-mono border-collapse">
                  <thead><tr>{detected.samples[0]?.map((_,i) => <th key={i} className="pr-6 pb-1 text-left text-gray-400 font-normal">Seg {i}</th>)}</tr></thead>
                  <tbody>{detected.samples.map((parts,ri) => <tr key={ri}>{parts.map((p,pi) => <td key={pi} className="pr-6 py-0.5 text-gray-700">{p}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
          </section>

          {/* Step 2: Segment editor */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Step 2 — Define segments</h2>
            <p className="text-sm text-gray-500">Click a segment to name it, classify codes, and group them. Only configure segments you want to use.</p>

            {segCount > 0 ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: segCount }, (_, i) => {
                  const seg = config.segments.find(s => s.index === i);
                  const isActive = activeSegIdx === i;
                  return (
                    <button key={i} onClick={() => { if (!seg) addSegment(i); else setActiveSegIdx(isActive ? null : i); }}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${isActive ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : seg ? "border-gray-300 bg-white text-gray-700 hover:border-gray-400" : "border-dashed border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                      <span className="text-xs opacity-50 mr-1">Seg {i}</span>
                      {seg?.name || <span className="italic">unnamed</span>}
                      {seg?.codes.length ? <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 rounded px-1">{seg.codes.length} codes</span> : null}
                      {config.functionAreaSegment === i && <span className="ml-1 text-[10px] bg-green-100 text-green-700 rounded px-1">Fn</span>}
                      {config.departmentSegment === i && <span className="ml-1 text-[10px] bg-orange-100 text-orange-700 rounded px-1">Dept</span>}
                      {config.spendingTypeSegment === i && <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 rounded px-1">Type</span>}
                      {config.subcategorySegment === i && <span className="ml-1 text-[10px] bg-purple-100 text-purple-600 rounded px-1">Sub</span>}
                    </button>
                  );
                })}
                <button onClick={() => addSegment(segCount)} className="px-3 py-2 rounded-lg border border-dashed border-gray-200 text-gray-400 text-sm hover:border-gray-300">+ Add</button>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">Run detection first, or click "+ Add" to create a segment.</p>
            )}
            <button onClick={() => addSegment(segCount)} className={segCount > 0 ? "hidden" : "px-3 py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 text-sm hover:border-gray-400"}>+ Add segment manually</button>

            {/* Active segment editor */}
            {activeSeg && (
              <div className="border border-blue-100 rounded-xl p-5 bg-blue-50/20 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-800">Segment {activeSeg.index}</h3>
                  <button onClick={() => removeSegment(activeSeg.index)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Name</label>
                    <input type="text" value={activeSeg.name} onChange={e => updSeg(activeSeg.index, { name: e.target.value })}
                      placeholder="e.g. Object Code, Program, Fund"
                      className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Prefix length for code lookup</label>
                    <input type="number" min={0} max={10} value={activeSeg.prefixLength}
                      onChange={e => updSeg(activeSeg.index, { prefixLength: parseInt(e.target.value)||0 })}
                      className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-1">0 = match full value · 2 = first 2 chars ("51" from "51110")</p>
                  </div>
                </div>

                {/* Classification role */}
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">What does this segment drive?</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${config.functionAreaSegment === activeSeg.index ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="checkbox" checked={config.functionAreaSegment === activeSeg.index}
                      onChange={e => upd({ functionAreaSegment: e.target.checked ? activeSeg.index : null })}
                      className="h-4 w-4 rounded border-gray-300" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Function Area</p>
                      <p className="text-xs text-gray-400">Top-level grouping (e.g. Public Safety, Education)</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${config.departmentSegment === activeSeg.index ? "border-orange-400 bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="checkbox" checked={config.departmentSegment === activeSeg.index}
                      onChange={e => upd({ departmentSegment: e.target.checked ? activeSeg.index : null })}
                      className="h-4 w-4 rounded border-gray-300" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Department</p>
                      <p className="text-xs text-gray-400">Second-level grouping within function areas</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${config.spendingTypeSegment === activeSeg.index ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="checkbox" checked={config.spendingTypeSegment === activeSeg.index}
                      onChange={e => upd({ spendingTypeSegment: e.target.checked ? activeSeg.index : null })}
                      className="h-4 w-4 rounded border-gray-300" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Spending Type</p>
                      <p className="text-xs text-gray-400">Drives spending type pie chart + KPI tiles</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${config.subcategorySegment === activeSeg.index ? "border-purple-400 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="checkbox" checked={config.subcategorySegment === activeSeg.index}
                      onChange={e => upd({ subcategorySegment: e.target.checked ? activeSeg.index : null })}
                      className="h-4 w-4 rounded border-gray-300" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Subcategory</p>
                      <p className="text-xs text-gray-400">Third-level grouping (e.g. school programs)</p>
                    </div>
                  </label>
                </div>

                {config.subcategorySegment === activeSeg.index && (
                  <div>
                    <label className="text-xs font-medium text-gray-600">Only apply subcategory to departments containing (comma-separated, blank = all)</label>
                    <input type="text" value={config.subcategoryDepartmentFilter.join(", ")}
                      onChange={e => upd({ subcategoryDepartmentFilter: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                      placeholder="school, education"
                      className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}

                {/* Revenue toggle */}
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={config.applyToRevenues}
                    onChange={e => upd({ applyToRevenues: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300" />
                  Apply these rules to revenue account codes too
                </label>

                {/* Code table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">Code definitions ({activeSeg.codes.length})</p>
                    <button onClick={() => loadMuniPresets(activeSeg.index)} className="text-xs text-blue-600 hover:underline">Load MA MUNIS object code presets</button>
                  </div>

                  <HelpBox title="Labels vs Groups" variant="tip">
                    <p className="text-xs text-gray-600">
                      <strong>Label</strong> = the specific code description shown in the detail table (e.g. "51110 — Regular Salaries").
                      <strong> Group</strong> = the bucket multiple codes roll up into on charts and KPI tiles (e.g. "Salaries & Wages").
                      Leave Group blank to use Label as-is. <strong>Codes sharing a Group are merged together</strong> in the portal — this is how you lump department codes or object codes into a single category.
                    </p>
                  </HelpBox>

                  {activeSeg.codes.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden mt-3 mb-3">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-24">Code</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Label (specific)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Group (merged)</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {activeSeg.codes.map(entry => (
                            <tr key={entry.code} className="border-t border-gray-100 hover:bg-gray-50/50">
                              <td className="px-3 py-1.5"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{entry.code}</code></td>
                              <td className="px-3 py-1.5">
                                <input type="text" value={entry.label} onChange={e => updCode(activeSeg.index, entry.code, { label: e.target.value })}
                                  className="w-full border-0 bg-transparent text-sm focus:outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1" />
                              </td>
                              <td className="px-3 py-1.5">
                                <input type="text" value={entry.group||""} onChange={e => updCode(activeSeg.index, entry.code, { group: e.target.value||undefined })}
                                  placeholder="e.g. Salaries & Wages"
                                  className="w-full border-0 bg-transparent text-sm text-gray-500 focus:outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1 placeholder:text-gray-300" />
                              </td>
                              <td className="px-2 text-center">
                                <button onClick={() => removeCode(activeSeg.index, entry.code)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <AddCodeRow onAdd={(code, label, group) => addCode(activeSeg.index, code, label, group)} />
                  <BulkImportRow onImport={(entries) => addCodes(activeSeg.index, entries)} />
                </div>
              </div>
            )}
          </section>

          {/* Preview */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Preview</h2>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-48">
                <label className="text-xs text-gray-500 font-medium">Account code</label>
                <input type="text" value={previewCode} onChange={e => setPreviewCode(e.target.value)}
                  placeholder="0001-300-300-2210-00-1-00-51110"
                  className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1 min-w-40">
                <label className="text-xs text-gray-500 font-medium">Department</label>
                <input type="text" value={previewDept} onChange={e => setPreviewDept(e.target.value)}
                  placeholder="Sutton Public Schools"
                  className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <button onClick={handlePreview} className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900">Test</button>
            {previewResult && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm space-y-1.5">
                <p><span className="text-gray-500 inline-block w-36">Function Area:</span>{previewResult.functionArea ? <strong className="text-green-700">{previewResult.functionArea}</strong> : <em className="text-gray-400">no match</em>}</p>
                <p><span className="text-gray-500 inline-block w-36">Department:</span>{previewResult.department ? <strong className="text-orange-700">{previewResult.department}</strong> : <em className="text-gray-400">no match</em>}</p>
                <p><span className="text-gray-500 inline-block w-36">Spending Type:</span>{previewResult.category1 ? <strong className="text-blue-700">{previewResult.category1}</strong> : <em className="text-gray-400">no match</em>}</p>
                <p><span className="text-gray-500 inline-block w-36">Subcategory:</span>{previewResult.category2 ? <strong className="text-purple-700">{previewResult.category2}</strong> : <em className="text-gray-400">no match</em>}</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── TAB: Revenue Segments ── */}
      {tab === "revenue-segments" && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            Define the account code structure for <strong>revenue</strong> accounts. Revenue accounts
            typically have a different structure from expenses. Map which segment drives the revenue
            category (e.g. "Taxes and Excise") and subcategory (e.g. "Motor Vehicle Excise").
          </p>

          <HelpBox title="How revenue account codes work" variant="tip">
            <p className="text-xs text-gray-600">
              When a revenue file is uploaded with an account number column, the system splits each
              account by the separator below and looks up the segment you designate as Category.
              For example, account <code className="bg-gray-100 px-1 rounded">0001-100-146-0000-00-0-00-41200</code> with
              separator <code className="bg-gray-100 px-1 rounded">-</code> and Category at Segment 7 with prefix length 3
              gives key <code className="bg-gray-100 px-1 rounded">412</code> → your defined label.
              If codes already exist in your upload as separate Category/Subcategory columns, those
              will be used as-is and this dictionary fills in any gaps.
            </p>
          </HelpBox>

          {/* Separator */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Revenue account separator</h2>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600">Separator character:</label>
              <input type="text" value={config.revenueConfig?.separator ?? "-"}
                onChange={e => updRevConfig({ separator: e.target.value })}
                className="w-16 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-xs text-gray-400">Usually the same as expenses ("-")</span>
            </div>
          </section>

          {/* Segment editor */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Revenue segments</h2>
            <p className="text-sm text-gray-500">Click a segment to define it. You only need to configure the segment(s) that drive category and subcategory.</p>

            {/* Segment strip */}
            {(() => {
              const revSegs = config.revenueConfig?.segments ?? [];
              const maxIdx = Math.max(...revSegs.map(s => s.index + 1), 8);
              return (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: maxIdx }, (_, i) => {
                    const seg = revSegs.find(s => s.index === i);
                    const isActive = activeRevSegIdx === i;
                    return (
                      <button key={i} onClick={() => { if (!seg) addRevSegment(i); setActiveRevSegIdx(isActive ? null : i); }}
                        className={`px-3 py-2 rounded-lg border text-sm transition-all ${isActive ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : seg ? "border-gray-300 bg-white text-gray-700 hover:border-gray-400" : "border-dashed border-gray-200 text-gray-400 hover:border-gray-300"}`}>
                        <span className="text-xs opacity-50 mr-1">Seg {i}</span>
                        {seg?.name || <span className="italic">unnamed</span>}
                        {seg?.codes.length ? <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-500 rounded px-1">{seg.codes.length} codes</span> : null}
                        {config.revenueConfig?.categorySegment === i && <span className="ml-1 text-[10px] bg-green-100 text-green-700 rounded px-1">Cat</span>}
                        {config.revenueConfig?.subcategorySegment === i && <span className="ml-1 text-[10px] bg-purple-100 text-purple-600 rounded px-1">Sub</span>}
                      </button>
                    );
                  })}
                  <button onClick={() => { addRevSegment(maxIdx); setActiveRevSegIdx(maxIdx); }}
                    className="px-3 py-2 rounded-lg border border-dashed border-gray-200 text-gray-400 text-sm hover:border-gray-300">+ Add</button>
                </div>
              );
            })()}

            {/* Active revenue segment editor */}
            {activeRevSeg && (
              <div className="border border-blue-100 rounded-xl p-5 bg-blue-50/20 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-800">Revenue Segment {activeRevSeg.index}</h3>
                  <button onClick={() => { updRevConfig({ segments: (config.revenueConfig?.segments ?? []).filter(s => s.index !== activeRevSeg.index) }); setActiveRevSegIdx(null); }} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Name</label>
                    <input type="text" value={activeRevSeg.name}
                      onChange={e => updRevSeg(activeRevSeg.index, { name: e.target.value })}
                      placeholder="e.g. Revenue Type Code"
                      className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Prefix length</label>
                    <input type="number" min={0} max={10} value={activeRevSeg.prefixLength}
                      onChange={e => updRevSeg(activeRevSeg.index, { prefixLength: parseInt(e.target.value)||0 })}
                      className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-1">e.g. 3 → "412" from "41200"</p>
                  </div>
                </div>

                {/* Category/Subcategory role */}
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">What does this segment drive?</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${config.revenueConfig?.categorySegment === activeRevSeg.index ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="checkbox"
                      checked={config.revenueConfig?.categorySegment === activeRevSeg.index}
                      onChange={e => updRevConfig({ categorySegment: e.target.checked ? activeRevSeg.index : null })}
                      className="h-4 w-4 rounded border-gray-300" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Category</p>
                      <p className="text-xs text-gray-400">Top-level revenue grouping (e.g. "Taxes and Excise")</p>
                    </div>
                  </label>
                  <label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${config.revenueConfig?.subcategorySegment === activeRevSeg.index ? "border-purple-400 bg-purple-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <input type="checkbox"
                      checked={config.revenueConfig?.subcategorySegment === activeRevSeg.index}
                      onChange={e => updRevConfig({ subcategorySegment: e.target.checked ? activeRevSeg.index : null })}
                      className="h-4 w-4 rounded border-gray-300" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Subcategory</p>
                      <p className="text-xs text-gray-400">Second-level grouping (e.g. "Motor Vehicle Excise")</p>
                    </div>
                  </label>
                </div>

                {/* Code table */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Code definitions ({activeRevSeg.codes.length})</p>
                  {activeRevSeg.codes.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-24">Code</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Label (specific)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Group (merged)</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {activeRevSeg.codes.map(entry => (
                            <tr key={entry.code} className="border-t border-gray-100 hover:bg-gray-50/50">
                              <td className="px-3 py-1.5"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{entry.code}</code></td>
                              <td className="px-3 py-1.5">
                                <input type="text" value={entry.label}
                                  onChange={e => updRevSeg(activeRevSeg.index, { codes: activeRevSeg.codes.map(c => c.code === entry.code ? { ...c, label: e.target.value } : c) })}
                                  className="w-full border-0 bg-transparent text-sm focus:outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1" />
                              </td>
                              <td className="px-3 py-1.5">
                                <input type="text" value={entry.group||""}
                                  onChange={e => updRevSeg(activeRevSeg.index, { codes: activeRevSeg.codes.map(c => c.code === entry.code ? { ...c, group: e.target.value||undefined } : c) })}
                                  placeholder="e.g. Taxes and Excise"
                                  className="w-full border-0 bg-transparent text-sm text-gray-500 focus:outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1 placeholder:text-gray-300" />
                              </td>
                              <td className="px-2 text-center">
                                <button onClick={() => updRevSeg(activeRevSeg.index, { codes: activeRevSeg.codes.filter(c => c.code !== entry.code) })}
                                  className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <AddCodeRow onAdd={(code, label, group) => addRevCodes(activeRevSeg.index, [{ code, label, group }])} />
                  <BulkImportRow onImport={(entries) => addRevCodes(activeRevSeg.index, entries)} />
                </div>
              </div>
            )}
          </section>

          {/* Revenue preview */}
          <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-800">Preview</h2>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500 font-medium">Revenue account code</label>
                <input type="text" value={revPreviewCode} onChange={e => setRevPreviewCode(e.target.value)}
                  placeholder="0001-100-146-0000-00-0-00-41200"
                  className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <button onClick={handleRevPreview} className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900">Test</button>
            {revPreviewResult && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm space-y-1.5">
                <p><span className="text-gray-500 inline-block w-32">Category:</span>{revPreviewResult.category1 ? <strong className="text-green-700">{revPreviewResult.category1}</strong> : <em className="text-gray-400">no match</em>}</p>
                <p><span className="text-gray-500 inline-block w-32">Subcategory:</span>{revPreviewResult.category2 ? <strong className="text-purple-700">{revPreviewResult.category2}</strong> : <em className="text-gray-400">no match</em>}</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── TAB: Organization ── */}
      {tab === "organization" && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            Define the hierarchy and sort order for each level of the expenses and revenues pages.
            Drag levels to reorder them, or use the arrows. Each level can be sorted independently.
          </p>

          {(["expenseLevels","revenueLevels"] as const).map(kind => {
            const levels = po[kind];
            const label = kind === "expenseLevels" ? "Expenses" : "Revenues";
            return (
              <section key={kind} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
                <h2 className="font-semibold text-gray-800">{label} hierarchy</h2>
                <div className="space-y-2">
                  {levels.map((level, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      {/* Position label */}
                      <span className="text-xs text-gray-400 w-6 text-center font-mono">{idx + 1}</span>

                      {/* Up/down */}
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveLevel(kind, idx, -1)} disabled={idx === 0}
                          className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none">▲</button>
                        <button onClick={() => moveLevel(kind, idx, 1)} disabled={idx === levels.length - 1}
                          className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none">▼</button>
                      </div>

                      {/* Name */}
                      <input type="text" value={level.name} onChange={e => updLevel(kind, idx, { name: e.target.value })}
                        placeholder="Level name (e.g. Function Area)"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

                      {/* Segment source */}
                      <div className="flex-1">
                        <select value={level.dataField ?? "functionArea"}
                          onChange={e => updLevel(kind, idx, { dataField: e.target.value as GroupField })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {Object.entries(GROUP_FIELD_LABELS).map(([field, label]) => (
                            <option key={field} value={field}>{label}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-0.5 px-1">Which data field to group by</p>
                      </div>

                      {/* Sort */}
                      <div>
                        <select value={level.sort}
                          onChange={e => updLevel(kind, idx, { sort: e.target.value as SortOrder })}
                          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          {SORT_OPTIONS.map(o => <option key={o} value={o}>{SORT_LABELS[o]}</option>)}
                        </select>
                        <p className="text-xs text-gray-400 mt-0.5 px-1">Sort order</p>
                      </div>

                      <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap cursor-pointer">
                        <input type="checkbox" checked={level.skipIfEmpty ?? false}
                          onChange={e => updLevel(kind, idx, { skipIfEmpty: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-gray-300" />
                        Skip if empty
                      </label>
                      <button onClick={() => removeLevel(kind, idx)} className="text-gray-300 hover:text-red-400 text-lg leading-none ml-1">×</button>
                    </div>
                  ))}
                  <button onClick={() => addLevel(kind)}
                    className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors">
                    + Add level
                  </button>
                </div>

                <HelpBox title="How levels work" variant="tip">
                  <p className="text-xs text-gray-600">
                    Levels define the nesting order in the portal table (top = outermost group, bottom = innermost).
                    <strong> Built-in field</strong> uses the data already in the system (Function Area, Department, Category, etc.).
                    <strong> Segment source</strong> uses a segment you defined in the dictionary tab to override or add a level.
                    Sort order applies independently per level.
                  </p>
                </HelpBox>
              </section>
            );
          })}
        </div>
      )}

      {/* Save bar */}
      <div className="flex items-center gap-4 pb-10 border-t border-gray-100 pt-6">
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save all rules"}
        </button>
        <p className="text-xs text-gray-400">Re-upload existing files after saving to reclassify them with new rules.</p>
      </div>
    </div>
  );
}

// ── Bulk import component ──────────────────────────────────────────────────

/**
 * Parses pasted text into code entries. Handles common formats:
 *
 * Tab-separated (Excel copy-paste):
 *   51110  Regular Salaries  Salaries & Wages
 *   51120  Overtime          Salaries & Wages
 *
 * Comma-separated:
 *   51110, Regular Salaries, Salaries & Wages
 *
 * Dash/hyphen separated descriptions (no group):
 *   51110 - Regular Salaries
 *   51120 - Overtime Salaries
 *
 * Code + label only (group inferred blank):
 *   51110 Regular Salaries
 *
 * Code only (one per line):
 *   51110
 *   51120
 */
function parseBulkText(text: string): Array<{ code: string; label: string; group: string }> {
  const results: Array<{ code: string; label: string; group: string }> = [];
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip header-like lines
    if (/^(code|account|object|segment|label|description|group|type)/i.test(line)) continue;

    let code = "", label = "", group = "";

    // Tab-separated (Excel): code\tlabel\tgroup
    if (line.includes("\t")) {
      const parts = line.split("\t").map(p => p.trim());
      code = parts[0] ?? "";
      label = parts[1] ?? "";
      group = parts[2] ?? "";
    }
    // Comma-separated: code,label,group
    else if ((line.match(/,/g) || []).length >= 1) {
      const parts = line.split(",").map(p => p.trim());
      code = parts[0] ?? "";
      label = parts[1] ?? "";
      group = parts[2] ?? "";
    }
    // Dash-separated: code - label (- group)
    else if (line.includes(" - ")) {
      const parts = line.split(" - ").map(p => p.trim());
      code = parts[0] ?? "";
      label = parts[1] ?? "";
      group = parts[2] ?? "";
    }
    // Space-separated: first token is code, rest is label
    else {
      const match = line.match(/^(\S+)\s+(.+)$/);
      if (match) {
        code = match[1];
        label = match[2];
      } else {
        code = line;
        label = line;
      }
    }

    code = code.trim();
    label = label.trim();
    group = group.trim();

    if (code) {
      results.push({ code, label: label || code, group });
    }
  }

  return results;
}

function BulkImportRow({ onImport }: { onImport: (entries: Array<{ code: string; label: string; group: string }>) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Array<{ code: string; label: string; group: string }>>([]);

  const handleImport = () => {
    if (preview.length === 0) return;
    onImport(preview);
    setText("");
    setPreview([]);
    setOpen(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs text-blue-600 hover:underline mt-1">
        + Bulk import from list
      </button>
    );
  }

  return (
    <div className="mt-3 border border-blue-200 rounded-xl p-4 bg-blue-50/20 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Bulk import codes</p>
        <button onClick={() => { setOpen(false); setText(""); setPreview([]); }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      <p className="text-xs text-gray-500">
        Paste from Excel or any list. Supported formats (one per line):
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono bg-gray-100 rounded-lg p-3 text-gray-600">
        <div><p className="font-sans font-medium text-gray-500 mb-1">Tab-separated (Excel)</p>51110{"\t"}Regular Salaries{"\t"}Salaries & Wages</div>
        <div><p className="font-sans font-medium text-gray-500 mb-1">Comma-separated</p>51110, Regular Salaries, Salaries & Wages</div>
        <div><p className="font-sans font-medium text-gray-500 mb-1">Dash-separated</p>51110 - Regular Salaries</div>
      </div>

      <textarea
        value={text}
        onChange={e => {
          const val = e.target.value;
          setText(val);
          setPreview(parseBulkText(val));
        }}
        rows={6}
        placeholder={"51110\tRegular Salaries\tSalaries & Wages\n51120\tOvertime Salaries\tSalaries & Wages\n53000\tPurchased Services\tPurchased Services"}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />

      {preview.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Preview — {preview.length} codes detected:</p>
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500 w-24">Code</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Label</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Group</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((entry, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-1"><code className="bg-gray-100 px-1 rounded">{entry.code}</code></td>
                    <td className="px-3 py-1 text-gray-700">{entry.label}</td>
                    <td className="px-3 py-1 text-gray-500">{entry.group || <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleImport}
          disabled={preview.length === 0}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
        >
          Import {preview.length > 0 ? `${preview.length} codes` : ""}
        </button>
        <button onClick={() => { setText(""); setPreview([]); }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Clear</button>
      </div>
    </div>
  );
}

// ── Add code row ────────────────────────────────────────────────────────────

function AddCodeRow({ onAdd }: { onAdd: (code: string, label: string, group: string) => void }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState("");
  const submit = () => { if (!code) return; onAdd(code.trim(), label.trim(), group.trim()); setCode(""); setLabel(""); setGroup(""); };
  return (
    <div className="flex items-center gap-2 pt-1 flex-wrap">
      <input type="text" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key==="Enter" && submit()}
        placeholder="Code" className="w-24 border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="text" value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key==="Enter" && submit()}
        placeholder="Label" className="flex-1 min-w-32 border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="text" value={group} onChange={e => setGroup(e.target.value)} onKeyDown={e => e.key==="Enter" && submit()}
        placeholder="Group (optional)" className="flex-1 min-w-32 border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={submit} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg">Add</button>
    </div>
  );
}
