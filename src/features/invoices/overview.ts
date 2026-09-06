import type { InvoiceLifecycle } from "@/lib/db/types";
import { convertToBaseCurrency } from "@/lib/finance/exchange";
import { invoiceBalance } from "@/lib/finance/money";

export type InvoiceOverview = {
  amountDueCents: number;
  draftCount: number;
  issuedCount: number;
  overdueCount: number;
  paidCount: number;
  totalCount: number;
  unconvertedAmountDueCount: number;
};

export type InvoiceOverviewRow = {
  lifecycle: InvoiceLifecycle;
  total_cents: number;
  paid_cents: unknown;
  due_date: string | null;
  currency: string;
  base_currency: string | null;
  exchange_rate_micros: number | null;
};

export function summariseInvoiceOverview(
  rows: readonly InvoiceOverviewRow[],
  baseCurrency: string,
  today: string,
): InvoiceOverview {
  const overview: InvoiceOverview = {
    amountDueCents: 0,
    draftCount: 0,
    issuedCount: 0,
    overdueCount: 0,
    paidCount: 0,
    totalCount: rows.length,
    unconvertedAmountDueCount: 0,
  };

  for (const row of rows) {
    if (row.lifecycle === "draft") {
      overview.draftCount += 1;
      continue;
    }
    if (row.lifecycle !== "issued") continue;

    overview.issuedCount += 1;
    const balance = invoiceBalance(row.total_cents, Number(row.paid_cents));
    if (balance === 0) {
      overview.paidCount += 1;
      continue;
    }
    const converted = convertToBaseCurrency({
      amountCents: balance,
      currency: row.currency,
      baseCurrency,
      storedBaseCurrency: row.base_currency,
      rateMicros: row.exchange_rate_micros,
    });
    if (converted.status === "converted") {
      overview.amountDueCents += converted.amountCents;
    } else {
      overview.unconvertedAmountDueCount += 1;
    }
    if (row.due_date && row.due_date < today) overview.overdueCount += 1;
  }

  return overview;
}
