"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import HelpBox from "@/components/admin/HelpBox";

interface Town {
  id: string;
  name: string;
}

interface FaqEntry {
  id: string;
  townId: string;
  question: string;
  answer: string;
  sortOrder: number;
  createdAt: string;
}

export default function AdminFaqsPage() {
  const [town, setTown] = useState<Town | null>(null);
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const townsRes = await fetch("/api/towns");
        const towns = await townsRes.json();
        if (towns.length === 0) {
          setLoading(false);
          return;
        }
        const t = towns[0];
        setTown(t);

        const faqsRes = await fetch(`/api/faqs?townId=${t.id}`);
        const faqsData = await faqsRes.json();
        setFaqs(faqsData);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!town || !newQuestion.trim() || !newAnswer.trim()) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          townId: town.id,
          question: newQuestion.trim(),
          answer: newAnswer.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add FAQ");
        return;
      }

      const faq = await res.json();
      setFaqs((prev) => [...prev, faq]);
      setNewQuestion("");
      setNewAnswer("");
    } catch {
      setError("Failed to add FAQ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (faqId: string) => {
    if (!confirm("Delete this FAQ?")) return;
    try {
      const res = await fetch(`/api/faqs/${faqId}`, { method: "DELETE" });
      if (res.ok) {
        setFaqs((prev) => prev.filter((f) => f.id !== faqId));
      }
    } catch {
      // ignore
    }
  };

  const startEditing = (faq: FaqEntry) => {
    setEditingId(faq.id);
    setEditQuestion(faq.question);
    setEditAnswer(faq.answer);
  };

  const moveFaq = async (faqId: string, direction: "up" | "down") => {
    const idx = faqs.findIndex((f) => f.id === faqId);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= faqs.length) return;

    const next = [...faqs];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    const renumbered = next.map((f, i) => ({ ...f, sortOrder: i }));

    const prevOrders = new Map(faqs.map((f) => [f.id, f.sortOrder]));
    const changed = renumbered.filter(
      (f) => prevOrders.get(f.id) !== f.sortOrder
    );

    setFaqs(renumbered);
    setReordering(true);
    setError("");

    try {
      const results = await Promise.all(
        changed.map((f) =>
          fetch(`/api/faqs/${f.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: f.sortOrder }),
          })
        )
      );
      if (results.some((r) => !r.ok)) {
        setError("Failed to save new order");
        setFaqs(faqs);
      }
    } catch {
      setError("Failed to save new order");
      setFaqs(faqs);
    } finally {
      setReordering(false);
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (faqId: string) => {
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/faqs/${faqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: editQuestion.trim(),
          answer: editAnswer.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update FAQ");
        return;
      }

      const updated = await res.json();
      setFaqs((prev) => prev.map((f) => (f.id === faqId ? updated : f)));
      setEditingId(null);
    } catch {
      setError("Failed to update FAQ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  if (!town) {
    return (
      <div>
        <p className="text-gray-500">
          No town configured.{" "}
          <Link href="/admin/setup" className="text-blue-600 hover:underline">
            Set up your town
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">FAQs</h1>
        <p className="text-gray-500 mt-1">
          Write the questions and answers that residents see on your
          portal&apos;s FAQ page.
        </p>
      </div>

      <HelpBox title="What appears here?" variant="info">
        <p>
          These question and answer pairs show up on the public FAQ tab.
          Residents can browse common questions about the budget without
          having to email anyone. Use clear, plain-language answers.
        </p>
      </HelpBox>

      {error && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-4"
          role="alert"
        >
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <section>
        <h2 className="text-lg font-medium mb-4">Add a FAQ</h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label
              htmlFor="faq-question"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Question
            </label>
            <input
              id="faq-question"
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Why did the school budget increase this year?"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label
              htmlFor="faq-answer"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Answer
            </label>
            <textarea
              id="faq-answer"
              value={newAnswer}
              onChange={(e) => setNewAnswer(e.target.value)}
              rows={4}
              placeholder="Higher special-education enrollment and a 3% salary adjustment account for most of the increase..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving || !newQuestion.trim() || !newAnswer.trim()}
            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? "Adding..." : "Add FAQ"}
          </button>
        </form>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
          <h2 className="text-lg font-medium">
            Existing FAQs{" "}
            <span className="text-gray-400 font-normal text-sm">
              ({faqs.length})
            </span>
          </h2>
          {faqs.length > 1 && (
            <p className="text-xs text-gray-500">
              Use the up and down arrows to reorder how FAQs appear on the
              public page.
            </p>
          )}
        </div>

        {faqs.length === 0 ? (
          <p className="text-sm text-gray-400">
            No FAQs added yet. Use the form above to add your first one.
          </p>
        ) : (
          <div className="space-y-3">
            {faqs.map((faq, idx) =>
              editingId === faq.id ? (
                <div
                  key={faq.id}
                  className="bg-white border border-blue-200 rounded-lg p-4 space-y-3"
                >
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Question
                    </label>
                    <input
                      type="text"
                      value={editQuestion}
                      onChange={(e) => setEditQuestion(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Answer
                    </label>
                    <textarea
                      value={editAnswer}
                      onChange={(e) => setEditAnswer(e.target.value)}
                      rows={4}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(faq.id)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={faq.id}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1 shrink-0 pt-0.5">
                      <button
                        type="button"
                        onClick={() => moveFaq(faq.id, "up")}
                        disabled={idx === 0 || reordering}
                        aria-label="Move up"
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveFaq(faq.id, "down")}
                        disabled={idx === faqs.length - 1 || reordering}
                        aria-label="Move down"
                        className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{faq.question}</p>
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
                        {faq.answer}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => startEditing(faq)}
                        className="text-sm text-gray-500 hover:text-gray-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(faq.id)}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}
