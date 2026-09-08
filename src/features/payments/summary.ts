import { convertToBaseCurrency } from "@/lib/finance/exchange";
import { shiftIsoDate } from "@/lib/iso-date";

type PaymentSummaryRow = {
  amount_cents: number;
  payment_date: string;
  currency: string;
  base_currency: string | null;
  exchange_rate_micros: number | null;
};

export type PaymentSummary = {
  recentCents: number;
  totalCents: number;
  missingConversionCount: number;
};

export function summarisePayments(
  payments: readonly PaymentSummaryRow[],
  baseCurrency: string,
  today: string,
): PaymentSummary {
  const summary: PaymentSummary = {
    recentCents: 0,
    totalCents: 0,
    missingConversionCount: 0,
  };
  const thirtyDaysAgo = shiftIsoDate(today, -29);

  for (const payment of payments) {
    const converted = convertToBaseCurrency({
      amountCents: payment.amount_cents,
      currency: payment.currency,
      baseCurrency,
      storedBaseCurrency: payment.base_currency,
      rateMicros: payment.exchange_rate_micros,
    });
    if (converted.status === "missing-rate") {
      summary.missingConversionCount += 1;
      continue;
    }
    summary.totalCents += converted.amountCents;
    if (payment.payment_date >= thirtyDaysAgo && payment.payment_date <= today) {
      summary.recentCents += converted.amountCents;
    }
  }

  return summary;
}
