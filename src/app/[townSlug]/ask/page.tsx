"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Town {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
}

export default function AskPage() {
  const params = useParams<{ townSlug: string }>();
  const townSlug = params.townSlug;

  const [town, setTown] = useState<Town | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTown() {
      try {
        const res = await fetch("/api/towns");
        const towns: Town[] = await res.json();
        const found = towns.find((t) => t.slug === townSlug);
        if (found) setTown(found);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    loadTown();
  }, [townSlug]);

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  if (!town) {
    return <p className="text-gray-500">Town not found.</p>;
  }

  const subject = encodeURIComponent(
    `Question about ${town.name}'s budget`
  );
  const body = encodeURIComponent(
    `Hi,\n\nI have a question about ${town.name}'s budget:\n\n[Your question here]\n\nThank you`
  );

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Ask a Question
        </h1>
        <p className="text-gray-500 mt-1">
          Have a question about {town.name}&apos;s budget or finances? Reach
          out directly to your town&apos;s finance office.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800 leading-relaxed">
            <strong>Your voice matters.</strong>{" "}
            Ask about anything you see on this portal — a line item
            that doesn&apos;t make sense, a number that seems off, or
            something you&apos;d like explained differently.
          </p>
        </div>

        {town.contactEmail ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-600">
              Send your question directly to {town.name}&apos;s finance office:
            </p>
            <a
              href={`mailto:${town.contactEmail}?subject=${subject}&body=${body}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
              </svg>
              Email {town.contactEmail}
            </a>
            <p className="text-xs text-gray-400">
              This will open your email app with a pre-filled message.
            </p>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">
              Contact information has not been configured for this portal yet.
              Please check back later.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
