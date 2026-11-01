"use client";
export default function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold print:hidden">Print or save as PDF</button>;
}
