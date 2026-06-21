import ExportButton from "@/components/portal/ExportButton";

interface FinancialPageHeaderProps {
  title: string;
  fiscalYear: string;
  itemCount?: number;
  itemLabel?: string;
  description: string;
  exportData?: Record<string, string>[];
  exportFilename?: string;
  breadcrumb?: string;
  meta?: string; // e.g. "4 fiscal years · $7.0M total"
}

export default function FinancialPageHeader({
  title,
  fiscalYear,
  itemCount,
  itemLabel = "line items",
  description,
  exportData,
  exportFilename,
  breadcrumb = "OpenBook / Financial Explorer",
  meta,
}: FinancialPageHeaderProps) {
  const subtitle = meta
    ? meta
    : itemCount !== undefined
    ? `FY${fiscalYear} adopted budget · ${itemCount.toLocaleString()} ${itemLabel}`
    : `FY${fiscalYear} adopted budget`;

  return (
    <div className="pt-2 pb-6 border-b border-gray-200/70 mb-8">
      {/* Breadcrumb */}
      <p className="text-xs text-gray-400 font-medium tracking-wide uppercase mb-4">
        {breadcrumb}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-2">
          <h1
            className="text-4xl font-bold tracking-tight text-gray-900"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>
          <p className="text-sm text-gray-500 font-medium">{subtitle}</p>
          <p className="text-base text-gray-600 max-w-xl leading-relaxed mt-1">
            {description}
          </p>
        </div>

        {exportData && exportFilename && (
          <div className="flex-shrink-0">
            <ExportButton data={exportData} filename={exportFilename} />
          </div>
        )}
      </div>
    </div>
  );
}
