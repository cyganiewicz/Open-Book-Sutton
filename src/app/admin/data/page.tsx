"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import HelpBox from "@/components/admin/HelpBox";
import StorageIndicator from "@/components/admin/StorageIndicator";

interface Upload {
  id: string;
  fileName: string;
  fileType: string;
  dataCategory: string;
  rowCount: number;
  status: string;
  createdAt: string;
}

interface Town {
  id: string;
  name: string;
  slug: string;
  published: boolean;
}

export default function DataManagementPage() {
  const router = useRouter();
  const [town, setTown] = useState<Town | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [error, setError] = useState("");
  const [unmapped, setUnmapped] = useState<{
    totalUnmapped: number;
    byCategory: Record<string, {
      uploadId: string;
      fileName: string;
      fiscalYear: string | null;
      items: { objectCode: string | null; lineItem: string | null; reason: string }[];
    }[]>;
    totalsByCategory: Record<string, { totalRows: number; unmappedRows: number }>;
  } | null>(null);
  const [unmappedOpen, setUnmappedOpen] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyResult, setReclassifyResult] = useState<string | null>(null);

  async function loadData() {
    try {
      const townsRes = await fetch("/api/towns");
      const towns = await townsRes.json();
      if (towns.length > 0) {
        const t = towns[0];
        setTown(t);

        const uploadsRes = await fetch(`/api/towns/${t.id}/uploads`);
        if (uploadsRes.ok) {
          const data = await uploadsRes.json();
          setUploads(data);
        }

        // Fetch unmapped items diagnostic
        const unmappedRes = await fetch(`/api/towns/${t.id}/unmapped`);
        if (unmappedRes.ok) {
          setUnmapped(await unmappedRes.json());
        }
      }
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (uploadId: string) => {
    if (!confirm("Delete this upload and all its budget data?")) return;
    setDeleting(uploadId);
    setError("");

    try {
      const res = await fetch(`/api/uploads/${uploadId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete");
        return;
      }
      await loadData();
    } catch {
      setError("Failed to delete upload");
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = async (upload: Upload) => {
    setDownloading(upload.id);
    try {
      const res = await fetch(`/api/uploads/${upload.id}`);
      if (!res.ok) {
        setError("Failed to download data");
        return;
      }
      const { rows } = await res.json();
      if (!rows || rows.length === 0) {
        setError("No data to download");
        return;
      }
      const fields = [
        "dataCategory", "fiscalYear", "amountType", "amount",
        "functionArea", "department", "lineItem", "objectCode",
        "category1", "category2", "fundCode", "fundName",
      ];
      const csvRows = [
        fields.join(","),
        ...rows.map((r: Record<string, string | number | null>) =>
          fields.map((f) => {
            const val = r[f];
            if (val == null) return "";
            const str = val.toString();
            return str.includes(",") || str.includes('"')
              ? `"${str.replace(/"/g, '""')}"` : str;
          }).join(",")
        ),
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = upload.fileName.replace(/\.[^.]+$/, "") + "-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download data");
    } finally {
      setDownloading(null);
    }
  };

  const handleDeleteAll = async () => {
    setError("");
    try {
      for (const upload of uploads) {
        await fetch(`/api/uploads/${upload.id}`, { method: "DELETE" });
      }
      setConfirmDeleteAll(false);
      await loadData();
    } catch {
      setError("Failed to delete all data");
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

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

  const totalRows = uploads.reduce((sum, u) => sum + u.rowCount, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budget Data</h1>
          <p className="text-gray-500 mt-1">
            {uploads.length} upload{uploads.length !== 1 ? "s" : ""} with {totalRows.toLocaleString()} total rows
          </p>
        </div>
        <Link
          href={`/admin/upload?townId=${town.id}`}
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          Upload New Data
        </Link>
      </div>

      <StorageIndicator />

      <HelpBox variant="info">
        <p>
          This page shows all the budget files you&apos;ve uploaded. Each file
          becomes part of your resident-facing portal. You can upload multiple
          files (e.g., one for expenses, one for revenues) and they&apos;ll all
          appear on your portal. If you upload a corrected version, delete the
          old one first.
        </p>
      </HelpBox>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {uploads.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">No data uploaded yet.</p>
          <Link
            href={`/admin/upload?townId=${town.id}`}
            className="text-blue-600 hover:underline text-sm mt-2 inline-block"
          >
            Upload your first file
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm" aria-label="Uploaded budget files">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600">File</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-gray-600">Rows</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr key={upload.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{upload.fileName}</td>
                    <td className="px-4 py-3 capitalize">{upload.dataCategory}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {upload.rowCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          upload.status === "mapped"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-yellow-50 text-yellow-700"
                        }`}
                      >
                        {upload.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(upload.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button
                        onClick={() => handleDownload(upload)}
                        disabled={downloading === upload.id}
                        className="text-gray-600 hover:text-gray-800 text-sm disabled:opacity-50"
                        aria-label={`Download upload ${upload.fileName}`}
                      >
                        {downloading === upload.id ? "Downloading..." : "Download"}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Replace "${upload.fileName}"? This will delete the current data and open the upload page so you can re-upload with new mappings.`)) return;
                          setDeleting(upload.id);
                          try {
                            const res = await fetch(`/api/uploads/${upload.id}`, { method: "DELETE" });
                            if (res.ok) {
                              router.push(`/admin/upload?townId=${town!.id}`);
                            }
                          } catch {
                            setError("Failed to delete upload");
                          } finally {
                            setDeleting(null);
                          }
                        }}
                        disabled={deleting === upload.id}
                        className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50"
                        aria-label={`Replace upload ${upload.fileName}`}
                      >
                        Replace
                      </button>
                      <button
                        onClick={() => handleDelete(upload.id)}
                        disabled={deleting === upload.id}
                        className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                        aria-label={`Delete upload ${upload.fileName}`}
                      >
                        {deleting === upload.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Re-apply mappings ── */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Re-apply Account Code Mappings</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  After updating your Account Code configuration, run this to apply the new mappings
                  to all existing uploaded data — no re-upload needed.
                </p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-3">
                {reclassifyResult && (
                  <span className="text-sm text-emerald-600 font-medium">{reclassifyResult}</span>
                )}
                <button
                  onClick={async () => {
                    if (!town) return;
                    setReclassifying(true);
                    setReclassifyResult(null);
                    try {
                      const res = await fetch(`/api/towns/${town.id}/reclassify`, { method: "POST" });
                      const data = await res.json();
                      setReclassifyResult(data.message || "Done");
                      // Refresh unmapped count
                      const u = await fetch(`/api/towns/${town.id}/unmapped`);
                      if (u.ok) setUnmapped(await u.json());
                    } catch {
                      setReclassifyResult("Error — please try again");
                    } finally {
                      setReclassifying(false);
                    }
                  }}
                  disabled={reclassifying}
                  className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {reclassifying ? "Applying…" : "Re-apply Mappings"}
                </button>
              </div>
            </div>
          </div>

          {/* ── Unmapped items diagnostic ── */}
          {unmapped && unmapped.totalUnmapped > 0 && (
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">!</span>
                    Unmapped Items
                    <span className="text-sm font-normal text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      {unmapped.totalUnmapped} item{unmapped.totalUnmapped !== 1 ? "s" : ""}
                    </span>
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    These rows cannot be placed in the portal hierarchy. After fixing Account Codes,
                    click <strong>Re-apply Mappings</strong> above — no re-upload needed.
                  </p>
                </div>
                <button
                  onClick={() => setUnmappedOpen(o => !o)}
                  className="text-sm text-blue-600 hover:underline flex-shrink-0"
                >
                  {unmappedOpen ? "Hide" : "Show details"}
                </button>
              </div>

              {unmappedOpen && (
                <div className="space-y-5">
                  {Object.entries(unmapped.byCategory).map(([cat, fileGroups]) => (
                    <div key={cat}>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3 capitalize">{cat}</p>
                      <div className="space-y-3">
                        {fileGroups.map(group => (
                          <div key={group.uploadId} className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-700">{group.fileName}</span>
                              {group.fiscalYear && (
                                <span className="text-xs text-gray-400">FY{group.fiscalYear}</span>
                              )}
                              <span className="text-xs text-amber-600 font-medium">
                                {group.items.length} unmapped item{group.items.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-gray-100 bg-white">
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Object Code</th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Line Item</th>
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((item, i) => (
                                  <tr key={i} className="border-t border-gray-50 hover:bg-amber-50/40">
                                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{item.objectCode || "—"}</td>
                                    <td className="px-4 py-2 text-gray-700">{item.lineItem || "—"}</td>
                                    <td className="px-4 py-2 text-amber-700 text-xs">{item.reason}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Fix in <strong>Account Codes</strong>, then click <strong>Re-apply Mappings</strong> above.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {unmapped && unmapped.totalUnmapped === 0 && (
            <div className="border-t border-gray-200 pt-6">
              <p className="text-sm text-emerald-600 flex items-center gap-2">
                <span>✓</span> All rows are mapped to categories. No unmapped items found.
              </p>
            </div>
          )}

          <div className="border-t border-gray-200 pt-6">
            <HelpBox variant="warning" title="About deleting data">
              <p>
                Deleting an upload removes it and all its budget rows from
                your portal permanently. If your portal is live, residents
                will no longer see that data. You can always re-upload the
                file later.
              </p>
            </HelpBox>
            <div className="mt-4">
            {!confirmDeleteAll ? (
              <button
                onClick={() => setConfirmDeleteAll(true)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Delete All Data
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-600">
                  This will delete all uploads and budget data. This cannot be undone.
                </p>
                <button
                  onClick={handleDeleteAll}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                >
                  Confirm Delete All
                </button>
                <button
                  onClick={() => setConfirmDeleteAll(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
