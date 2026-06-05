"use client";

import { useState, useEffect } from "react";
import HelpBox from "@/components/admin/HelpBox";
import type { AccountCodeRules, AccountSegmentRule } from "@/lib/account-codes";
import { detectAccountStructure } from "@/lib/account-codes";

// ── Blank rule templates ───────────────────────────────────────────────────

const blankSegmentRule = (): AccountSegmentRule => ({
  segmentIndex: 0,
  prefixLength: 2,
  mapping: {},
});

const blankRules = (): AccountCodeRules => ({
  separator: "-",
  spendingTypeRule: blankSegmentRule(),
  subcategoryRule: undefined,
  subcategoryDepartmentFilter: [],
});

// ── Component ─────────────────────────────────────────────────────────────

export default function AccountCodesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Raw rules state
  const [rules, setRules] = useState<AccountCodeRules>(blankRules());
  const [hasRules, setHasRules] = useState(false);
  const [useSubcategory, setUseSubcategory] = useState(false);
  const [deptFilterText, setDeptFilterText] = useState(""); // comma-separated

  // Preview
  const [previewCode, setPreviewCode] = useState("");
  const [previewDept, setPreviewDept] = useState("");
  const [previewResult, setPreviewResult] = useState<{ cat1: string | null; cat2: string | null } | null>(null);

  // Sample detection
  const [sampleInput, setSampleInput] = useState("");
  const [detected, setDetected] = useState<{ separator: string; segmentCount: number; samples: string[][] } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/towns");
        const towns = await res.json();
        if (towns.length > 0 && towns[0].accountCodeRules) {
          try {
            const parsed = JSON.parse(towns[0].accountCodeRules) as AccountCodeRules;
            setRules(parsed);
            setHasRules(true);
            setUseSubcategory(!!parsed.subcategoryRule);
            setDeptFilterText((parsed.subcategoryDepartmentFilter || []).join(", "));
          } catch {
            // no rules yet
          }
        }
      } catch {
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────

  const updateSpendingRule = (key: keyof AccountSegmentRule, value: string | number) => {
    setRules((prev) => ({
      ...prev,
      spendingTypeRule: {
        ...(prev.spendingTypeRule ?? blankSegmentRule()),
        [key]: value,
      },
    }));
  };

  const updateSpendingMapping = (code: string, label: string) => {
    setRules((prev) => ({
      ...prev,
      spendingTypeRule: {
        ...(prev.spendingTypeRule ?? blankSegmentRule()),
        mapping: { ...(prev.spendingTypeRule?.mapping ?? {}), [code]: label },
      },
    }));
  };

  const removeSpendingMapping = (code: string) => {
    setRules((prev) => {
      const m = { ...(prev.spendingTypeRule?.mapping ?? {}) };
      delete m[code];
      return { ...prev, spendingTypeRule: { ...(prev.spendingTypeRule ?? blankSegmentRule()), mapping: m } };
    });
  };

  const updateSubRule = (key: keyof AccountSegmentRule, value: string | number) => {
    setRules((prev) => ({
      ...prev,
      subcategoryRule: {
        ...(prev.subcategoryRule ?? blankSegmentRule()),
        [key]: value,
      },
    }));
  };

  const updateSubMapping = (code: string, label: string) => {
    setRules((prev) => ({
      ...prev,
      subcategoryRule: {
        ...(prev.subcategoryRule ?? blankSegmentRule()),
        mapping: { ...(prev.subcategoryRule?.mapping ?? {}), [code]: label },
      },
    }));
  };

  const removeSubMapping = (code: string) => {
    setRules((prev) => {
      const m = { ...(prev.subcategoryRule?.mapping ?? {}) };
      delete m[code];
      return { ...prev, subcategoryRule: { ...(prev.subcategoryRule ?? blankSegmentRule()), mapping: m } };
    });
  };

  const handleDetect = () => {
    const codes = sampleInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (codes.length === 0) return;
    const result = detectAccountStructure(codes);
    setDetected(result);
    setRules((prev) => ({ ...prev, separator: result.separator }));
  };

  const handlePreview = async () => {
    if (!previewCode) return;
    const { applyAccountCodeRules } = await import("@/lib/account-codes");
    const filters = deptFilterText.split(",").map((s) => s.trim()).filter(Boolean);
    const r: AccountCodeRules = {
      ...rules,
      subcategoryRule: useSubcategory ? rules.subcategoryRule : undefined,
      subcategoryDepartmentFilter: filters,
    };
    const result = applyAccountCodeRules(previewCode, previewDept || null, r);
    setPreviewResult({ cat1: result.category1, cat2: result.category2 });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const filters = deptFilterText.split(",").map((s) => s.trim()).filter(Boolean);
      const finalRules: AccountCodeRules = {
        separator: rules.separator,
        spendingTypeRule: rules.spendingTypeRule,
        subcategoryRule: useSubcategory ? rules.subcategoryRule : undefined,
        subcategoryDepartmentFilter: filters.length > 0 ? filters : undefined,
      };

      const res = await fetch("/api/towns", { method: "GET" });
      const towns = await res.json();
      if (!towns.length) { setError("No town found"); return; }

      const patchRes = await fetch(`/api/towns/${towns[0].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountCodeRules: JSON.stringify(finalRules) }),
      });
      if (!patchRes.ok) throw new Error("Save failed");
      setHasRules(true);
      setSuccess("Rules saved! They will apply automatically to all future uploads.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirm("Remove all account code rules? Auto-categorization will stop working for future uploads.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/towns", { method: "GET" });
      const towns = await res.json();
      await fetch(`/api/towns/${towns[0].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountCodeRules: "" }),
      });
      setRules(blankRules());
      setHasRules(false);
      setUseSubcategory(false);
      setSuccess("Rules cleared.");
    } catch {
      setError("Failed to clear rules");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500 text-sm">Loading…</div>;

  const spendingMapping = rules.spendingTypeRule?.mapping ?? {};
  const subMapping = rules.subcategoryRule?.mapping ?? {};

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Account Code Rules</h1>
        <p className="text-sm text-gray-500 mt-1">
          Define how your account numbers are structured so OpenBook can automatically
          assign spending types and subcategories when you upload budget data.
          Rules apply to all future uploads — no extra columns needed.
        </p>
      </div>

      {hasRules && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          <span>✓</span>
          <span>Rules are active. New uploads will be auto-categorized.</span>
          <button onClick={handleClear} className="ml-auto text-xs text-emerald-600 underline">Clear rules</button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>}
      {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">{success}</p>}

      {/* Step 1: Detect structure */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Step 1 — Detect your account structure</h2>
        <p className="text-sm text-gray-500">
          Paste a few sample account codes from your file. OpenBook will detect the separator and segment layout.
        </p>
        <textarea
          value={sampleInput}
          onChange={(e) => setSampleInput(e.target.value)}
          placeholder={"0001-300-300-2210-00-1-00-51110\n0001-100-113-0000-00-0-00-57300\n100.22.10.51110"}
          rows={4}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleDetect}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Detect structure
        </button>

        {detected && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">
              Detected separator: <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs">{detected.separator === " " ? "(space)" : detected.separator}</code>
              &ensp;·&ensp; {detected.segmentCount} segments
            </p>
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr>
                  {detected.samples[0]?.map((_, i) => (
                    <th key={i} className="text-left pb-1 text-gray-400 font-normal pr-4">Seg {i}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detected.samples.map((parts, ri) => (
                  <tr key={ri}>
                    {parts.map((p, pi) => (
                      <td key={pi} className="pr-4 py-0.5 text-gray-700">{p}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <label className="text-sm text-gray-600 font-medium">Separator character</label>
          <input
            type="text"
            value={rules.separator}
            onChange={(e) => setRules((p) => ({ ...p, separator: e.target.value }))}
            className="mt-1 block w-16 border border-gray-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="-"
          />
        </div>
      </section>

      {/* Step 2: Spending type rule */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Step 2 — Spending type (category)</h2>
        <p className="text-sm text-gray-500">
          Which segment contains the spending type code (e.g. object code)? 
          Define what each code prefix means.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 font-medium">Segment index (0-based)</label>
            <input
              type="number"
              min={0}
              value={rules.spendingTypeRule?.segmentIndex ?? 0}
              onChange={(e) => updateSpendingRule("segmentIndex", parseInt(e.target.value))}
              className="mt-1 block w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              e.g. for <code className="bg-gray-100 px-1 rounded">0001-300-51110</code>, segment 2 is <code className="bg-gray-100 px-1 rounded">51110</code>
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium">Prefix length (0 = full value)</label>
            <input
              type="number"
              min={0}
              max={10}
              value={rules.spendingTypeRule?.prefixLength ?? 2}
              onChange={(e) => updateSpendingRule("prefixLength", parseInt(e.target.value))}
              className="mt-1 block w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              e.g. prefix length 2 turns <code className="bg-gray-100 px-1 rounded">51110</code> → key <code className="bg-gray-100 px-1 rounded">51</code>
            </p>
          </div>
        </div>

        {/* Mapping table */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Code → Label mapping</p>
          <div className="space-y-2">
            {Object.entries(spendingMapping).map(([code, label]) => (
              <div key={code} className="flex items-center gap-2">
                <input
                  type="text"
                  value={code}
                  readOnly
                  className="w-24 border border-gray-200 rounded px-2 py-1.5 text-sm font-mono bg-gray-50"
                />
                <span className="text-gray-400">→</span>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => updateSpendingMapping(code, e.target.value)}
                  className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={() => removeSpendingMapping(code)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
              </div>
            ))}
            <AddMappingRow onAdd={(code, label) => updateSpendingMapping(code, label)} />
          </div>
        </div>

        <HelpBox title="Common MA MUNIS object code prefixes" variant="tip">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
            {[["51","Salaries & Wages"],["52","Employee Benefits"],["53","Purchased Services"],["54","Supplies & Materials"],["57","Other Charges"],["58","Capital Outlay"],["59","Debt Service"],["61","Special Ed Tuition"]].map(([code, label]) => (
              <button
                key={code}
                onClick={() => updateSpendingMapping(code, label)}
                className="text-left text-blue-600 hover:underline"
              >
                <code>{code}</code> → {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">Click any row above to add it to your mapping.</p>
        </HelpBox>
      </section>

      {/* Step 3: Subcategory rule (optional) */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-800">Step 3 — Subcategory (optional)</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
            <input
              type="checkbox"
              checked={useSubcategory}
              onChange={(e) => setUseSubcategory(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Enable subcategory rule
          </label>
        </div>

        {!useSubcategory && (
          <p className="text-sm text-gray-400">
            Enable this if a different segment of the account code identifies a program or cost center
            (e.g. school program codes that group lines into Instruction, Administration, etc.).
          </p>
        )}

        {useSubcategory && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 font-medium">Segment index (0-based)</label>
                <input
                  type="number"
                  min={0}
                  value={rules.subcategoryRule?.segmentIndex ?? 3}
                  onChange={(e) => updateSubRule("segmentIndex", parseInt(e.target.value))}
                  className="mt-1 block w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Prefix length (0 = full value)</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={rules.subcategoryRule?.prefixLength ?? 1}
                  onChange={(e) => updateSubRule("prefixLength", parseInt(e.target.value))}
                  className="mt-1 block w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 font-medium">Only apply to departments containing (comma-separated, leave blank for all)</label>
              <input
                type="text"
                value={deptFilterText}
                onChange={(e) => setDeptFilterText(e.target.value)}
                placeholder="school, education"
                className="mt-1 block w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Code → Label mapping</p>
              <div className="space-y-2">
                {Object.entries(subMapping).map(([code, label]) => (
                  <div key={code} className="flex items-center gap-2">
                    <input type="text" value={code} readOnly className="w-24 border border-gray-200 rounded px-2 py-1.5 text-sm font-mono bg-gray-50" />
                    <span className="text-gray-400">→</span>
                    <input type="text" value={label} onChange={(e) => updateSubMapping(code, e.target.value)} className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={() => removeSubMapping(code)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                ))}
                <AddMappingRow onAdd={(code, label) => updateSubMapping(code, label)} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* Preview */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Preview</h2>
        <p className="text-sm text-gray-500">Test your rules against a real account code before saving.</p>
        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="text-xs text-gray-500">Account code</label>
            <input
              type="text"
              value={previewCode}
              onChange={(e) => setPreviewCode(e.target.value)}
              placeholder="0001-300-300-2210-00-1-00-51110"
              className="mt-1 block w-72 border border-gray-200 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Department name (for subcategory filter)</label>
            <input
              type="text"
              value={previewDept}
              onChange={(e) => setPreviewDept(e.target.value)}
              placeholder="Sutton Public Schools"
              className="mt-1 block w-56 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button onClick={handlePreview} className="px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900">
          Test
        </button>
        {previewResult && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm space-y-1">
            <p><span className="text-gray-500 w-36 inline-block">Spending Type:</span> <strong>{previewResult.cat1 ?? <em className="text-gray-400">no match</em>}</strong></p>
            <p><span className="text-gray-500 w-36 inline-block">Subcategory:</span> <strong>{previewResult.cat2 ?? <em className="text-gray-400">no match</em>}</strong></p>
          </div>
        )}
      </section>

      {/* Save */}
      <div className="flex gap-3 pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save rules"}
        </button>
        <p className="text-xs text-gray-400 self-center">
          Rules apply to new uploads only. Re-upload existing files to re-categorize them.
        </p>
      </div>
    </div>
  );
}

// Small helper component for adding new mapping rows
function AddMappingRow({ onAdd }: { onAdd: (code: string, label: string) => void }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  return (
    <div className="flex items-center gap-2 pt-1">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Code"
        className="w-24 border border-dashed border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="text-gray-400">→</span>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label"
        className="flex-1 border border-dashed border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={() => {
          if (code && label) { onAdd(code, label); setCode(""); setLabel(""); }
        }}
        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded"
      >
        Add
      </button>
    </div>
  );
}
