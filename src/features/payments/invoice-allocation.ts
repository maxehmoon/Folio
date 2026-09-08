import type { DatabaseExecutor, Invoice, NewInvoice, Payment } from "@/lib/db";
import { getExchangeRate } from "@/lib/exchange-rates";
import { convertCents, EXCHANGE_RATE_SCALE } from "@/lib/finance/exchange";

type CurrencySnapshot = {
  currency: string;
  base_currency?: string | null;
  exchange_rate_micros?: number | null;
};

function snapshotRate(snapshot: CurrencySnapshot): number | null {
  return snapshot.currency === snapshot.base_currency
    ? EXCHANGE_RATE_SCALE
    : snapshot.exchange_rate_micros ?? null;
}

export function paymentAmountInInvoiceCurrency(
  payment: CurrencySnapshot & { amount_cents: number },
  invoice: CurrencySnapshot,
): number | null {
  if (payment.currency === invoice.currency) return payment.amount_cents;
  const paymentRate = snapshotRate(payment);
  const invoiceRate = snapshotRate(invoice);
  if (payment.base_currency === invoice.currency && paymentRate) {
    return convertCents(payment.amount_cents, paymentRate);
  }
  const numeratorRate = payment.currency === invoice.base_currency
    ? EXCHANGE_RATE_SCALE
    : payment.base_currency && payment.base_currency === invoice.base_currency
      ? paymentRate
      : null;
  if (!numeratorRate || !invoiceRate) return null;

  // Divide once using the original receipt amount so successive invoice edits
  // cannot accumulate conversion rounding or change the recorded receipt.
  const numerator = BigInt(payment.amount_cents) * BigInt(numeratorRate);
  const denominator = BigInt(invoiceRate);
  const converted = Number((numerator + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(converted)) {
    throw new RangeError("The converted payment amount is too large");
  }
  return converted;
}

export function paymentExchangeSnapshot(invoice: CurrencySnapshot & {
  exchange_rate_date?: string | null;
  exchange_rate_source?: string | null;
}) {
  const baseCurrency = invoice.base_currency ?? invoice.currency;
  return {
    base_currency: baseCurrency,
    exchange_rate_micros: invoice.currency === baseCurrency
      ? EXCHANGE_RATE_SCALE
      : invoice.exchange_rate_micros ?? null,
    exchange_rate_date: invoice.exchange_rate_date ?? null,
    exchange_rate_source: invoice.exchange_rate_source ?? null,
  };
}

export class PaymentAllocationError extends Error {}

export async function reallocateInvoicePayments(
  transaction: DatabaseExecutor,
  original: Invoice,
  next: NewInvoice,
) {
  const payments = await transaction.selectFrom("payments").selectAll()
    .where("business_id", "=", original.business_id)
    .where("invoice_id", "=", original.id).execute();
  const sameValuation = original.currency === next.currency &&
    original.base_currency === next.base_currency &&
    original.exchange_rate_micros === next.exchange_rate_micros &&
    original.issue_date === next.issue_date;

  for (const storedPayment of payments) {
    const payment: Payment = storedPayment.base_currency
      ? storedPayment
      : { ...storedPayment, ...paymentExchangeSnapshot(original) };
    let appliedAmount = sameValuation && payment.applied_amount_cents !== null
      ? payment.applied_amount_cents
      : paymentAmountInInvoiceCurrency(payment, next);
    if (appliedAmount === null) {
      try {
        const rate = await getExchangeRate(payment.currency, next.currency, next.issue_date);
        appliedAmount = convertCents(payment.amount_cents, rate.rateMicros);
      } catch {
        throw new PaymentAllocationError("Could not convert the recorded payments. Try saving again shortly.");
      }
    }
    await transaction.updateTable("payments").set({
      applied_amount_cents: appliedAmount,
      base_currency: payment.base_currency,
      exchange_rate_micros: payment.exchange_rate_micros,
      exchange_rate_date: payment.exchange_rate_date,
      exchange_rate_source: payment.exchange_rate_source,
    }).where("id", "=", payment.id)
      .where("business_id", "=", original.business_id).execute();
  }
}
