"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDTO } from "@/lib/capital/projects";
import { ApiError, ErrorBox, Field, inputCls, postJson } from "./parts";

export default function NewProjectForm({ departments, basePath }: { departments: { id: string; name: string }[]; basePath: string }) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({ message: "", details: [] as string[] });

  if (departments.length === 0) {
    return <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">You haven’t been assigned to a department yet. Ask the Town Manager’s office to add you, and then you can start requests here.</p>;
  }
  return (
    <form className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5 max-w-xl" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setErr({ message: "", details: [] });
      try {
        const p = await postJson<ProjectDTO>("/api/capital/projects", { departmentId, fields: { title } });
        router.push(`${basePath}/${p.id}`);
      } catch (x) { setErr(x instanceof ApiError ? { message: x.message, details: x.details } : { message: "Something went wrong.", details: [] }); setBusy(false); }
    }}>
      <p className="text-sm text-gray-600">Start with a name. You’ll add the description, costs, photos and quote on the next screen, and you can save a draft and come back any time.</p>
      <ErrorBox message={err.message} details={err.details} />
      {departments.length > 1 && (
        <Field label="Department" htmlFor="nd"><select id="nd" value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={inputCls}>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      )}
      <Field label="Project name" htmlFor="nt" hint="A brief name, e.g. “Replace Engine 2” or “Library roof repair”.">
        <input id="nt" value={title} onChange={e => setTitle(e.target.value)} className={inputCls} autoFocus />
      </Field>
      <button type="submit" disabled={busy || title.trim().length < 3} className="px-5 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50">{busy ? "Creating…" : "Start request"}</button>
    </form>
  );
}
