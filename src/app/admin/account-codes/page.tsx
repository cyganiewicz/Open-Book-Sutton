"use client";

import { useState, useEffect } from "react";
import HelpBox from "@/components/admin/HelpBox";
import {
  type AccountCodeConfig,
  type AccountSegment,
  type CodeEntry,
  emptyConfig,
  parseAccountCodeConfig,
  detectAccountStructure,
  applyAccountCodeConfig,
} from "@/lib/account-codes";

// ── Small helpers ──────────────────────────────────────────────────────────

function blankSegment(index: number): AccountSegment {
  return { index, name: "", prefixLength: 0, codes: [] };
}

const MA_MUNIS_PRESETS: CodeEntry[] = [
  { code: "51", label: "51xxx", group: "Salaries & Wages" },
  { code: "52", label: "52xxx", group: "Employee Benefits" },
  { code: "53", label: "53xxx", group: "Purchased Services" },
  { code: "54", label: "54xxx", group: "Supplies & Materials" },
  { code: "55", label: "55xxx", group: "Supplies & Materials" },
  { code: "57", label: "57xxx", group: "Other Charges & Expenses" },
  { code: "58", label: "58xxx", group: "Capital Outlay" },
  { code: "59", label: "59xxx", group: "Debt Service" },
  { code: "61", label: "61xxx", group: "Special Ed Tuition" },
  { code: "62", label: "62xxx", group: "Special Ed Tuition" },
  { code: "63", label: "63xxx", group: "Special Ed Tuition" },
];

// ── Main component ─────────────────────────────────────────────────────────

export default function AccountCodesPage() {
  const [townId, setTownId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [config, setConfig] = useState<AccountCodeConfig>(emptyConfig());
  const [activeSegIdx, setActiveSegIdx] = useState<number | null>(null); // which segment is being edited

  // Step 1: detect
  const [sampleInput, setSampleInput] = useState("");
  const [detected, setDetected] = useState<{ separator: string; segmentCount: number; samples: string[][] } | null>(null);

  // Preview
  const [previewCode, setPreviewCode] = useState("");
  const [previewDept, setPreviewDept] = useState("");
  const [previewResult, setPreviewResult] = useState<{ category1: string | null; category2: string | null } | null>(null);

  // Load
  useEffect(() => {
    fetch("/api/towns").then((r) => r.json()).then((towns) => {
      if (towns.length > 0) {
        setTownId(towns[0].id);
        const parsed = parseAccountCodeConfig(towns[0].accountCodeRules || "");
        if (parsed) setConfig(parsed);
      }
    }).catch(() => setMsg({ type: "err", text: "Failed to load" }))
      .finally(() => setLoading(false));
  }, []);

  // ── Config mutators ──────────────────────────────────────────────────────

  const updateConfig = (patch: Partial<AccountCodeConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));

  const updateSegment = (idx: number, patch: Partial<AccountSegment>) =>
    setConfig((c) => ({
      ...c,
      segments: c.segments.map((s) => s.index === idx ? { ...s, ...patch } : s),
    }));

  const addSegment = (index: number) => {
    if (config.segments.find((s) => s.index === index)) return;
    setConfig((c) => ({
      ...c,
      segments: [...c.segments, blankSegment(index)].sort((a, b) => a.index - b.index),
    }));
    setActiveSegIdx(index);
  };

  const removeSegment = (index: number) => {
    setConfig((c) => ({
      ...c,
      segments: c.segments.filter((s) => s.index !== index),
      spendingTypeSegment: c.spendingTypeSegment === index ? null : c.spendingTypeSegment,
      subcategorySegment: c.subcategorySegment === index ? null : c.subcategorySegment,
    }));
    if (activeSegIdx === index) setActiveSegIdx(null);
  };

  const addCode = (segIdx: number, code: string, label: string, group: string) => {
    if (!code) return;
    updateSegment(segIdx, {
      codes: [
        ...((config.segments.find((s) => s.index === segIdx)?.codes ?? []).filter((c) => c.code !== code)),
        { code, label: label || code, ...(group ? { group } : {}) },
      ].sort((a, b) => a.code.localeCompare(b.code)),
    });
  };

  const removeCode = (segIdx: number, code: string) => {
    const seg = config.segments.find((s) => s.index === segIdx);
    if (!seg) return;
    updateSegment(segIdx, { codes: seg.codes.filter((c) => c.code !== code) });
  };

  const updateCode = (segIdx: number, code: string, patch: Partial<CodeEntry>) => {
    const seg = config.segments.find((s) => s.index === segIdx);
    if (!seg) return;
    updateSegment(segIdx, {
      codes: seg.codes.map((c) => c.code === code ? { ...c, ...patch } : c),
    });
  };

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleDetect = () => {
    const codes = sampleInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!codes.length) return;
    const result = detectAccountStructure(codes);
    setDetected(result);
    updateConfig({ separator: result.separator });
  };

  const handlePreview = () => {
    const result = applyAccountCodeConfig(previewCode || null, previewDept || null, config);
    setPreviewResult(result);
  };

  const handleSave = async () => {
    if (!townId) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/towns/${townId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountCodeRules: JSON.stringify(config) }),
      });
      if (!res.ok) throw new Error("Save failed");
      setMsg({ type: "ok", text: "Saved! Rules will apply to all future uploads." });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!townId || !confirm("Remove all account code rules?")) return;
    await fetch(`/api/towns/${townId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountCodeRules: "" }),
    });
    setConfig(emptyConfig());
    setMsg({ type: "ok", text: "Rules cleared." });
  };

  const loadMuniPresets = (segIdx: number) => {
    const seg = config.segments.find((s) => s.index === segIdx);
    if (!seg) return;
    const existing = new Set(seg.codes.map((c) => c.code));
    const toAdd = MA_MUNIS_PRESETS.filter((p) => !existing.has(p.code));
    updateSegment(segIdx, { codes: [...seg.codes, ...toAdd].sort((a, b) => a.code.localeCompare(b.code)), prefixLength: 2 });
  };

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;

  const activeSeg = activeSegIdx !== null ? config.segments.find((s) => s.index === activeSegIdx) : null;
  const segmentCount = detected?.segmentCount ?? Math.max(...config.segments.map((s) => s.index + 1), 0);

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Account Code Dictionary</h1>
        <p className="text-sm text-gray-500 mt-1">
          Define your account number structure once. OpenBook will automatically classify
          line items when you upload data — no extra columns needed. Works for both
          expenses and revenues.
        </p>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${msg.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
          {msg.type === "ok" && config.segments.length > 0 && (
            <button onClick={handleClear} className="ml-4 underline text-xs opacity-60 hover:opacity-100">Clear all rules</button>
          )}
        </div>
      )}

      {/* Step 1: Detect */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Step 1 — Detect your account structure</h2>
          {detected && <span className="text-xs text-emerald-600 font-medium">✓ Detected</span>}
        </div>
        <p className="text-sm text-gray-500">Paste a few sample account codes from your export file.</p>
        <textarea
          value={sampleInput}
          onChange={(e) => setSampleInput(e.target.value)}
          rows={3}
          placeholder={"0001-300-300-2210-00-1-00-51110\n0001-100-113-0000-00-0-00-57300"}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center gap-3">
          <button onClick={handleDetect} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            Detect structure
          </button>
          <div>
            <label className="text-xs text-gray-500 mr-2">Separator:</label>
            <input
              type="text"
              value={config.separator}
              onChange={(e) => updateConfig({ separator: e.target.value })}
              className="w-12 border border-gray-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {detected && (
          <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
            <p className="text-xs font-medium text-gray-600 mb-2">
              Separator: <code className="bg-gray-200 px-1 rounded">{detected.separator}</code>
              &ensp;·&ensp; {detected.segmentCount} segments per code
            </p>
            <table className="text-xs font-mono border-collapse">
              <thead>
                <tr>
                  {detected.samples[0]?.map((_, i) => (
                    <th key={i} className="pr-6 pb-1 text-left text-gray-400 font-normal">Seg {i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detected.samples.map((parts, ri) => (
                  <tr key={ri}>
                    {parts.map((p, pi) => <td key={pi} className="pr-6 py-0.5 text-gray-700">{p}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Step 2: Name segments */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Step 2 — Name and configure each segment</h2>
        <p className="text-sm text-gray-500">
          Click a segment to name it and define what each code value means.
          You only need to configure segments you want to use for classification.
        </p>

        {/* Segment strip */}
        {segmentCount > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: segmentCount }, (_, i) => {
              const seg = config.segments.find((s) => s.index === i);
              const isActive = activeSegIdx === i;
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (!seg) addSegment(i);
                    setActiveSegIdx(isActive ? null : i);
                  }}
                  className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                    isActive
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                      : seg
                      ? "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                      : "border-dashed border-gray-200 text-gray-400 hover:border-gray-300"
                  }`}
                >
                  <span className="text-xs opacity-60 mr-1">Seg {i}</span>
                  {seg?.name || <span className="italic">unnamed</span>}
                  {config.spendingTypeSegment === i && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-600 rounded px-1">Type</span>}
                  {config.subcategorySegment === i && <span className="ml-1.5 text-[10px] bg-purple-100 text-purple-600 rounded px-1">Sub</span>}
                </button>
              );
            })}
            <button
              onClick={() => addSegment(segmentCount)}
              className="px-3 py-2 rounded-lg border border-dashed border-gray-200 text-gray-400 text-sm hover:border-gray-300"
            >
              + Add segment
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Run detection first, or add segments manually.</p>
        )}

        {/* Active segment editor */}
        {activeSeg && (
          <div className="border border-blue-200 rounded-xl p-5 bg-blue-50/30 space-y-5 mt-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-800">Segment {activeSeg.index}</h3>
              <button onClick={() => removeSegment(activeSeg.index)} className="text-xs text-red-400 hover:text-red-600">Remove segment</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Segment name</label>
                <input
                  type="text"
                  value={activeSeg.name}
                  onChange={(e) => updateSegment(activeSeg.index, { name: e.target.value })}
                  placeholder="e.g. Object Code, Program, Fund"
                  className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Prefix length for lookup</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={activeSeg.prefixLength}
                  onChange={(e) => updateSegment(activeSeg.index, { prefixLength: parseInt(e.target.value) || 0 })}
                  className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">0 = full value. 2 = first 2 chars (e.g. "51" from "51110")</p>
              </div>
            </div>

            {/* Role in classification */}
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="spendingType"
                  checked={config.spendingTypeSegment === activeSeg.index}
                  onChange={() => updateConfig({ spendingTypeSegment: activeSeg.index })}
                  className="h-4 w-4"
                />
                Use as <strong>Spending Type</strong> (groups expenses by category)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="radio"
                  name="spendingType"
                  checked={config.spendingTypeSegment !== activeSeg.index}
                  onChange={() => {
                    if (config.spendingTypeSegment === activeSeg.index)
                      updateConfig({ spendingTypeSegment: null });
                  }}
                  className="h-4 w-4"
                />
                Not a spending type segment
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.subcategorySegment === activeSeg.index}
                  onChange={(e) => updateConfig({ subcategorySegment: e.target.checked ? activeSeg.index : null })}
                  className="h-4 w-4 rounded"
                />
                Also use as <strong>Subcategory</strong>
              </label>
              {config.subcategorySegment === activeSeg.index && (
                <div className="w-full">
                  <label className="text-xs text-gray-500">Only apply to departments containing (comma-separated, blank = all)</label>
                  <input
                    type="text"
                    value={config.subcategoryDepartmentFilter.join(", ")}
                    onChange={(e) =>
                      updateConfig({
                        subcategoryDepartmentFilter: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                    placeholder="school, education"
                    className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Code entries table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">
                  Code definitions ({activeSeg.codes.length})
                </p>
                <button
                  onClick={() => loadMuniPresets(activeSeg.index)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Load MA MUNIS object code presets
                </button>
              </div>

              {activeSeg.codes.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-24">Code</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Label</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Group (optional)</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {activeSeg.codes.map((entry) => (
                        <tr key={entry.code} className="border-t border-gray-100">
                          <td className="px-3 py-1.5">
                            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{entry.code}</code>
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={entry.label}
                              onChange={(e) => updateCode(activeSeg.index, entry.code, { label: e.target.value })}
                              className="w-full border-0 bg-transparent text-sm focus:outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={entry.group || ""}
                              onChange={(e) => updateCode(activeSeg.index, entry.code, { group: e.target.value || undefined })}
                              placeholder="e.g. Salaries & Wages"
                              className="w-full border-0 bg-transparent text-sm text-gray-400 focus:outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1 placeholder:text-gray-300"
                            />
                          </td>
                          <td className="px-2">
                            <button onClick={() => removeCode(activeSeg.index, entry.code)} className="text-gray-300 hover:text-red-400">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <AddCodeRow onAdd={(code, label, group) => addCode(activeSeg.index, code, label, group)} />

              <HelpBox title="About Groups" variant="tip">
                <p className="text-xs">
                  <strong>Label</strong> is the specific code description (e.g. "51110 — Regular Salaries").
                  <strong> Group</strong> rolls multiple codes up into a single category on the portal
                  (e.g. codes 51110, 51120, 51310 all grouped as "Salaries & Wages").
                  The portal uses the group name if set, otherwise the label.
                </p>
              </HelpBox>
            </div>
          </div>
        )}
      </section>

      {/* Step 3: Portal organization */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Step 3 — Portal organization</h2>
        <p className="text-sm text-gray-500">
          Choose how the expenses and revenues pages organize data using your segment classifications.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">Spending Type segment</p>
              <p className="text-xs text-gray-400 mt-0.5">Drives the "by spending type" pie chart and KPI tiles on the expenses page</p>
            </div>
            <select
              value={config.spendingTypeSegment ?? ""}
              onChange={(e) => updateConfig({ spendingTypeSegment: e.target.value === "" ? null : parseInt(e.target.value) })}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {config.segments.map((s) => (
                <option key={s.index} value={s.index}>Seg {s.index}{s.name ? ` — ${s.name}` : ""}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">Subcategory segment</p>
              <p className="text-xs text-gray-400 mt-0.5">Creates a second level of grouping within departments (e.g. school program areas)</p>
            </div>
            <select
              value={config.subcategorySegment ?? ""}
              onChange={(e) => updateConfig({ subcategorySegment: e.target.value === "" ? null : parseInt(e.target.value) })}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None</option>
              {config.segments.map((s) => (
                <option key={s.index} value={s.index}>Seg {s.index}{s.name ? ` — ${s.name}` : ""}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700">Apply to revenue accounts</p>
              <p className="text-xs text-gray-400 mt-0.5">Use the same account code structure when uploading revenue data</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.applyToRevenues}
                onChange={(e) => updateConfig({ applyToRevenues: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">Enabled</span>
            </label>
          </div>
        </div>
      </section>

      {/* Preview */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Preview</h2>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-48">
            <label className="text-xs text-gray-500 font-medium">Account code</label>
            <input
              type="text"
              value={previewCode}
              onChange={(e) => setPreviewCode(e.target.value)}
              placeholder="0001-300-300-2210-00-1-00-51110"
              className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-40">
            <label className="text-xs text-gray-500 font-medium">Department (for subcategory filter)</label>
            <input
              type="text"
              value={previewDept}
              onChange={(e) => setPreviewDept(e.target.value)}
              placeholder="Sutton Public Schools"
              className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button onClick={handlePreview} className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900">Test</button>
        {previewResult && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm space-y-1.5">
            <p>
              <span className="text-gray-500 inline-block w-36">Spending Type:</span>
              {previewResult.category1
                ? <strong className="text-gray-900">{previewResult.category1}</strong>
                : <em className="text-gray-400">no match</em>}
            </p>
            <p>
              <span className="text-gray-500 inline-block w-36">Subcategory:</span>
              {previewResult.category2
                ? <strong className="text-gray-900">{previewResult.category2}</strong>
                : <em className="text-gray-400">no match / not applicable</em>}
            </p>
          </div>
        )}
      </section>

      {/* Save */}
      <div className="flex items-center gap-4 pb-10">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save account code rules"}
        </button>
        <p className="text-xs text-gray-400">
          Rules apply to new uploads only. Re-upload existing files to reclassify them.
        </p>
      </div>
    </div>
  );
}

// ── Add code row ───────────────────────────────────────────────────────────

function AddCodeRow({ onAdd }: { onAdd: (code: string, label: string, group: string) => void }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState("");

  const submit = () => {
    if (!code) return;
    onAdd(code.trim(), label.trim(), group.trim());
    setCode(""); setLabel(""); setGroup("");
  };

  return (
    <div className="flex items-center gap-2 pt-1 flex-wrap">
      <input type="text" value={code} onChange={(e) => setCode(e.target.value)}
        placeholder="Code" onKeyDown={(e) => e.key === "Enter" && submit()}
        className="w-24 border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
        placeholder="Label" onKeyDown={(e) => e.key === "Enter" && submit()}
        className="flex-1 min-w-32 border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="text" value={group} onChange={(e) => setGroup(e.target.value)}
        placeholder="Group (optional)" onKeyDown={(e) => e.key === "Enter" && submit()}
        className="flex-1 min-w-32 border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={submit}
        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg">
        Add
      </button>
    </div>
  );
}
