"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import HelpBox from "@/components/admin/HelpBox";

interface Town { id: string; name: string; }
interface TooltipData { id: string; scope: string; key: string; text: string; }

type PageTab = "expenses" | "revenues" | "capital" | "all";
const PAGE_TABS: { id: PageTab; label: string }[] = [
  { id: "expenses", label: "Expenses" },
  { id: "revenues", label: "Revenues" },
  { id: "capital", label: "Capital" },
  { id: "all", label: "All" },
];

const DATA_CATEGORY_MAP: Record<PageTab, string | undefined> = {
  expenses: "expenses",
  revenues: "revenues",
  capital: "capital",
  all: undefined,
};

// Searchable combobox component
function SearchableSelect({
  items,
  value,
  onChange,
  hasTooltip,
  placeholder,
  id,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  hasTooltip: (key: string) => boolean;
  placeholder: string;
  id: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(i => i.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (item: string) => {
    onChange(item);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative w-full max-w-lg" id={id}>
      <div
        className={`flex items-center border rounded-md bg-white overflow-hidden ${open ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-300"}`}
      >
        <input
          type="text"
          value={open ? query : (value || "")}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={value ? value : placeholder}
          className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-haspopup="listbox"
        />
        {value && (
          <button
            onClick={() => { onChange(""); setQuery(""); }}
            className="px-2 py-2 text-gray-400 hover:text-gray-600 text-xs"
            aria-label="Clear selection"
          >✕</button>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          className="px-2 py-2 text-gray-400 border-l border-gray-200"
          aria-label="Toggle dropdown"
          tabIndex={-1}
        >▾</button>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400 italic">No results for "{query}"</p>
          ) : (
            <ul role="listbox">
              {filtered.map(item => (
                <li
                  key={item}
                  role="option"
                  aria-selected={item === value}
                  onClick={() => handleSelect(item)}
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${item === value ? "bg-blue-50 font-medium text-blue-700" : "text-gray-700"}`}
                >
                  <span className="truncate">{item}</span>
                  {hasTooltip(item) && (
                    <span className="ml-2 flex-shrink-0 inline-block w-2 h-2 rounded-full bg-emerald-500" title="Has tooltip" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Tooltip editor card
function TooltipEditor({
  scope,
  selectedKey,
  text,
  onChange,
  onSave,
  onClear,
  saving,
  saved,
  placeholder,
}: {
  scope: string;
  selectedKey: string;
  text: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onClear: () => void;
  saving: boolean;
  saved: boolean;
  placeholder: string;
}) {
  if (!selectedKey) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">{scope}</p>
          <p className="text-base font-semibold text-gray-800">{selectedKey}</p>
        </div>
        {text && (
          <button onClick={onClear} className="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 mt-1">
            Clear tooltip
          </button>
        )}
      </div>

      <textarea
        value={text}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5" role="status">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Saved
          </span>
        )}
        <p className="text-xs text-gray-400 ml-auto">Leave empty and Save to remove.</p>
      </div>
    </div>
  );
}

export default function TooltipsPage() {
  const [town, setTown] = useState<Town | null>(null);
  const [tooltips, setTooltips] = useState<TooltipData[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allLineItems, setAllLineItems] = useState<string[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<string[]>([]);
  const [filteredLineItems, setFilteredLineItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageTab, setPageTab] = useState<PageTab>("expenses");
  const [saving, setSaving] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLineItem, setSelectedLineItem] = useState("");
  const [editTexts, setEditTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    async function load() {
      try {
        const townsRes = await fetch("/api/towns");
        const towns = await townsRes.json();
        if (towns.length === 0) { setLoading(false); return; }
        const t = towns[0];
        setTown(t);

        const [tooltipRes, keysRes] = await Promise.all([
          fetch(`/api/tooltips?townId=${t.id}`),
          fetch(`/api/towns/${t.id}/budget-keys`),
        ]);

        const tooltipData: TooltipData[] = await tooltipRes.json();
        setTooltips(tooltipData);

        const texts: Record<string, string> = {};
        for (const tip of tooltipData) texts[`${tip.scope}:${tip.key}`] = tip.text;
        setEditTexts(texts);

        if (keysRes.ok) {
          const keys = await keysRes.json();
          setAllCategories(keys.categories || []);
          setAllLineItems(keys.lineItems || []);
          setFilteredCategories(keys.categories || []);
          setFilteredLineItems(keys.lineItems || []);
        }
      } catch { /* ignore */ } finally { setLoading(false); }
    }
    load();
  }, []);

  // Re-filter when tab changes
  useEffect(() => {
    if (!town) return;
    const dataCategory = DATA_CATEGORY_MAP[pageTab];
    if (!dataCategory) {
      setFilteredCategories(allCategories);
      setFilteredLineItems(allLineItems);
      return;
    }
    fetch(`/api/towns/${town.id}/budget-keys?dataCategory=${dataCategory}`)
      .then(r => r.json())
      .then(keys => {
        setFilteredCategories(keys.categories || []);
        setFilteredLineItems(keys.lineItems || []);
        setSelectedCategory("");
        setSelectedLineItem("");
      })
      .catch(() => {});
  }, [pageTab, town]);

  const handleSave = async (scope: string, key: string) => {
    if (!town) return;
    const textKey = `${scope}:${key}`;
    const text = editTexts[textKey] || "";
    setSaving(textKey);
    try {
      await fetch("/api/tooltips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ townId: town.id, scope, key, text }),
      });
      setTooltips(prev => {
        const existing = prev.find(t => t.scope === scope && t.key === key);
        if (text.trim()) {
          if (existing) return prev.map(t => t.scope === scope && t.key === key ? { ...t, text } : t);
          return [...prev, { id: "", scope, key, text }];
        }
        return prev.filter(t => !(t.scope === scope && t.key === key));
      });
      setSavedKey(textKey);
      setTimeout(() => setSavedKey(null), 2500);
    } catch { /* ignore */ } finally { setSaving(null); }
  };

  const getTooltipText = (scope: string, key: string) => editTexts[`${scope}:${key}`] ?? "";
  const setTooltipText = (scope: string, key: string, text: string) =>
    setEditTexts(prev => ({ ...prev, [`${scope}:${key}`]: text }));
  const clearTooltip = (scope: string, key: string) => {
    setEditTexts(prev => ({ ...prev, [`${scope}:${key}`]: "" }));
  };

  const categoryHasTooltip = (cat: string) =>
    tooltips.some(t => t.scope === "category" && t.key === cat && t.text);
  const lineItemHasTooltip = (li: string) =>
    tooltips.some(t => t.scope === "line-item" && t.key === li && t.text);

  // Summary counts
  const categoryCount = tooltips.filter(t => t.scope === "category" && t.text).length;
  const lineItemCount = tooltips.filter(t => t.scope === "line-item" && t.text).length;

  if (loading) return <p className="text-gray-500 py-10 text-center">Loading…</p>;

  if (!town) {
    return (
      <p className="text-gray-500">
        No town configured.{" "}
        <Link href="/admin/setup" className="text-blue-600 hover:underline">Set up your town</Link> first.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tooltips & Explainers</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Add plain-language explanations for budget categories and line items. These appear when residents hover or tap in the portal.
          </p>
        </div>
        {(categoryCount > 0 || lineItemCount > 0) && (
          <div className="flex gap-4 flex-shrink-0 text-sm text-gray-500">
            <span><strong className="text-gray-800">{categoryCount}</strong> categor{categoryCount === 1 ? "y" : "ies"}</span>
            <span><strong className="text-gray-800">{lineItemCount}</strong> line item{lineItemCount !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      <HelpBox title="How tooltips work" variant="info">
        <p>Category tooltips show a <strong>(?) icon</strong> next to the category name in the table. Line item tooltips appear when a resident hovers over or taps a specific row. Use the page tabs below to filter the dropdown to only show items from that page.</p>
      </HelpBox>

      {/* Page tabs */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Filter by page</p>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {PAGE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setPageTab(tab.id)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                pageTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Explainers */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Category Tooltips</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Broad groupings like "Public Safety" or "Education" — a (?) icon appears next to any that have an explanation.
          </p>
        </div>

        {filteredCategories.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No categories found for this page type. Upload data first.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SearchableSelect
                id="categorySelect"
                items={filteredCategories}
                value={selectedCategory}
                onChange={setSelectedCategory}
                hasTooltip={categoryHasTooltip}
                placeholder={`Search ${filteredCategories.length} categories…`}
              />
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {filteredCategories.filter(categoryHasTooltip).length} of {filteredCategories.length} have tooltips
              </span>
            </div>

            <TooltipEditor
              scope="Category"
              selectedKey={selectedCategory}
              text={getTooltipText("category", selectedCategory)}
              onChange={v => setTooltipText("category", selectedCategory, v)}
              onSave={() => handleSave("category", selectedCategory)}
              onClear={() => clearTooltip("category", selectedCategory)}
              saving={saving === `category:${selectedCategory}`}
              saved={savedKey === `category:${selectedCategory}`}
              placeholder="Explain this category for residents (1–2 sentences)…"
            />
          </div>
        )}
      </section>

      <div className="border-t border-gray-100" />

      {/* Line Item Tooltips */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Line Item Tooltips</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Individual rows like "Police Salaries" or "Road Maintenance" — hover text appears when a resident moves their cursor over the row.
          </p>
        </div>

        {filteredLineItems.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No line items found for this page type. Upload data first.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SearchableSelect
                id="lineItemSelect"
                items={filteredLineItems}
                value={selectedLineItem}
                onChange={setSelectedLineItem}
                hasTooltip={lineItemHasTooltip}
                placeholder={`Search ${filteredLineItems.length} line items…`}
              />
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {filteredLineItems.filter(lineItemHasTooltip).length} of {filteredLineItems.length} have tooltips
              </span>
            </div>

            <TooltipEditor
              scope="Line Item"
              selectedKey={selectedLineItem}
              text={getTooltipText("line-item", selectedLineItem)}
              onChange={v => setTooltipText("line-item", selectedLineItem, v)}
              onSave={() => handleSave("line-item", selectedLineItem)}
              onClear={() => clearTooltip("line-item", selectedLineItem)}
              saving={saving === `line-item:${selectedLineItem}`}
              saved={savedKey === `line-item:${selectedLineItem}`}
              placeholder="What does this line item pay for? (1–2 sentences)…"
            />
          </div>
        )}
      </section>

      {/* Existing tooltips summary */}
      {(categoryCount > 0 || lineItemCount > 0) && (
        <>
          <div className="border-t border-gray-100" />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">All Saved Tooltips</h2>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Key</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Tooltip Text</th>
                    <th className="px-4 py-2 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {tooltips.filter(t => t.text).map((tip, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tip.scope === "category" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                          {tip.scope === "category" ? "Category" : "Line Item"}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-700">{tip.key}</td>
                      <td className="px-4 py-2 text-gray-500 truncate max-w-xs">{tip.text}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => {
                            if (tip.scope === "category") {
                              setSelectedCategory(tip.key);
                            } else {
                              setSelectedLineItem(tip.key);
                            }
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
