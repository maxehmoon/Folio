import { formatMoney } from "@/lib/format";

import type { FinancialSummary } from "./queries";

interface ReportBreakdownProps {
  currency: string;
  summary: FinancialSummary;
}

export function ReportBreakdown({ currency, summary }: ReportBreakdownProps) {
  const rows = [
    {
      label: "Invoice sales",
      description: "Issued invoices dated within the selected period",
      value: summary.salesCents,
    },
    {
      label: "Payments received",
      description: "Payments recorded within the selected period",
      value: summary.receiptsCents,
    },
    {
      label: "Expenses",
      description: "Expenses incurred within the selected period",
      value: -summary.expensesCents,
    },
  ];

  return (
    <div className="divide-y divide-border">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-[13px] font-medium text-foreground">{row.label}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{row.description}</p>
          </div>
          <p className="tabular-nums text-[14px] font-medium text-foreground">
            {formatMoney(row.value, currency)}
          </p>
        </div>
      ))}
      <div className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-[13px] font-medium text-foreground">Cash net income</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Payments received less expenses</p>
        </div>
        <p className="tabular-nums text-[14px] font-medium text-foreground">
          {formatMoney(summary.netIncomeCents, currency)}
        </p>
      </div>
    </div>
  );
}
