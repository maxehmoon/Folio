import { formatMoney } from "@/lib/format";

import type { ReportInsights } from "./queries";

export function ReportHighlights({
  currency,
  insights,
}: {
  currency: string;
  insights: ReportInsights;
}) {
  const { summary, points, granularity, invoiceCount } = insights;
  const strongest = points
    .filter((point) => point.receiptsCents > 0 || point.expensesCents > 0)
    .reduce<(typeof points)[number] | null>((best, point) => (
      !best || point.receiptsCents - point.expensesCents > best.receiptsCents - best.expensesCents
        ? point
        : best
    ), null);
  const highlights = [
    {
      label: `Best ${granularity} with activity`,
      value: strongest?.label ?? "—",
      detail: strongest
        ? `${formatMoney(strongest.receiptsCents - strongest.expensesCents, currency)} net income`
        : "No cash activity",
    },
    {
      label: "Expenses / receipts",
      value: summary.receiptsCents > 0
        ? `${((summary.expensesCents / summary.receiptsCents) * 100).toFixed(1)}%`
        : "—",
      detail: summary.receiptsCents > 0
        ? "Of payments received"
        : "No payments received",
    },
    {
      label: "Average invoice",
      value: invoiceCount > 0
        ? formatMoney(Math.round(summary.salesCents / invoiceCount), currency)
        : "—",
      detail: invoiceCount > 0
        ? `${invoiceCount} issued ${invoiceCount === 1 ? "invoice" : "invoices"}`
        : "No issued invoices",
    },
  ];

  return (
    <dl aria-label="Period figures" className="grid border-t sm:grid-cols-3 sm:divide-x">
      {highlights.map(({ label, value, detail }) => (
        <div className="min-w-0 px-5 py-4 transition-colors duration-150 hover:bg-surface-subtle" key={label}>
          <dt className="text-[12px] text-subtle-foreground">{label}</dt>
          <dd className="mt-1 break-words text-[14px] font-medium tabular-nums">{value}</dd>
          <dd className="mt-1 text-[11px] text-muted-foreground">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
