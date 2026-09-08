import type {
  Business,
  Customer,
  DatabaseExecutor,
  InvoiceLifecycle,
  NewInvoice,
  NewInvoiceLine,
} from "@/lib/db";
import { joinAddressParts } from "@/lib/address";
import { calculateInvoiceTotals, calculateLine } from "@/lib/finance";
import { isIsoDate } from "@/lib/iso-date";

import { buildInvoiceSellerSnapshot } from "./seller-snapshot";

export type InvoiceAggregateLineInput = {
  itemId: string | null;
  description: string;
  details?: string | null;
  unit: string;
  quantityThousandths: number;
  unitPriceCents: number;
  taxRateBps: number;
};

export type InvoiceExchangeSnapshot = {
  base: string;
  quote: string;
  rateMicros: number;
  date: string;
  source: string;
};

export type PrepareInvoiceAggregateInput = {
  id: string;
  business: Business;
  customer: Customer;
  recurringInvoiceId: string | null;
  recurrenceIndex: number | null;
  invoiceNumber: string | null;
  lifecycle: InvoiceLifecycle;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  exchangeRate: InvoiceExchangeSnapshot;
  notes: string | null;
  paymentInstructions: string | null;
  lines: readonly InvoiceAggregateLineInput[];
  timestamp: string;
};

export type PreparedInvoiceAggregate = {
  invoice: NewInvoice;
  lines: NewInvoiceLine[];
};

export class InvoiceAggregateConflictError extends Error {}

export function prepareInvoiceAggregate(
  input: PrepareInvoiceAggregateInput,
  createLineId: () => string,
): PreparedInvoiceAggregate {
  if (
    input.exchangeRate.base !== input.currency ||
    input.exchangeRate.quote !== input.business.currency ||
    !Number.isSafeInteger(input.exchangeRate.rateMicros) ||
    input.exchangeRate.rateMicros <= 0 ||
    !isIsoDate(input.exchangeRate.date) ||
    !input.exchangeRate.source.trim()
  ) {
    throw new RangeError("The invoice exchange-rate snapshot is invalid");
  }
  const calculatedLines = input.lines.map((line) => ({
    ...line,
    ...calculateLine(line),
  }));
  const totals = calculateInvoiceTotals(calculatedLines);

  const invoice: NewInvoice = {
    id: input.id,
    business_id: input.business.id,
    customer_id: input.customer.id,
    recurring_invoice_id: input.recurringInvoiceId,
    recurrence_index: input.recurrenceIndex,
    invoice_number: input.invoiceNumber,
    lifecycle: input.lifecycle,
    issue_date: input.issueDate,
    due_date: input.dueDate,
    currency: input.currency,
    base_currency: input.business.currency,
    exchange_rate_micros: input.exchangeRate.rateMicros,
    exchange_rate_date: input.exchangeRate.date,
    exchange_rate_source: input.exchangeRate.source,
    ...buildInvoiceSellerSnapshot(input.business),
    customer_name: input.customer.name,
    customer_billing_name: input.customer.billing_name ?? null,
    customer_email: input.customer.email,
    customer_phone: input.customer.phone,
    customer_tax_id: input.customer.tax_id,
    customer_address: joinAddressParts([
      input.customer.address_line_1,
      input.customer.address_line_2,
      input.customer.city,
      input.customer.region,
      input.customer.postal_code,
    ]),
    customer_country_code: input.customer.country_code,
    notes: input.notes,
    payment_instructions: input.paymentInstructions,
    subtotal_cents: totals.subtotalCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    created_at: input.timestamp,
    updated_at: input.timestamp,
  };

  return {
    invoice,
    lines: calculatedLines.map((line, position) => ({
      id: createLineId(),
      business_id: input.business.id,
      invoice_id: input.id,
      item_id: line.itemId,
      position,
      description: line.description,
      details: line.details ?? null,
      unit: line.unit,
      quantity_thousandths: line.quantityThousandths,
      unit_price_cents: line.unitPriceCents,
      tax_rate_bps: line.taxRateBps,
      subtotal_cents: line.subtotalCents,
      tax_cents: line.taxCents,
      total_cents: line.totalCents,
      created_at: input.timestamp,
      updated_at: input.timestamp,
    })),
  };
}

export async function insertInvoiceAggregate(
  executor: DatabaseExecutor,
  aggregate: PreparedInvoiceAggregate,
) {
  await executor.insertInto("invoices").values(aggregate.invoice).execute();
  await executor.insertInto("invoice_lines").values(aggregate.lines).execute();
}

export async function replaceInvoiceAggregate(
  executor: DatabaseExecutor,
  aggregate: PreparedInvoiceAggregate,
  lifecycle: InvoiceLifecycle,
) {
  const invoice = aggregate.invoice;
  const result = await executor
    .updateTable("invoices")
    .set({
      customer_id: invoice.customer_id,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      currency: invoice.currency,
      base_currency: invoice.base_currency,
      exchange_rate_micros: invoice.exchange_rate_micros,
      exchange_rate_date: invoice.exchange_rate_date,
      exchange_rate_source: invoice.exchange_rate_source,
      seller_name: invoice.seller_name,
      seller_email: invoice.seller_email,
      seller_phone: invoice.seller_phone,
      seller_tax_id: invoice.seller_tax_id,
      seller_address: invoice.seller_address,
      seller_country_code: invoice.seller_country_code,
      customer_name: invoice.customer_name,
      customer_billing_name: invoice.customer_billing_name,
      customer_email: invoice.customer_email,
      customer_phone: invoice.customer_phone,
      customer_tax_id: invoice.customer_tax_id,
      customer_address: invoice.customer_address,
      customer_country_code: invoice.customer_country_code,
      notes: invoice.notes,
      payment_instructions: invoice.payment_instructions,
      invoice_footer: invoice.invoice_footer,
      subtotal_cents: invoice.subtotal_cents,
      tax_cents: invoice.tax_cents,
      total_cents: invoice.total_cents,
      updated_at: invoice.updated_at,
    })
    .where("id", "=", invoice.id)
    .where("business_id", "=", invoice.business_id)
    .where("lifecycle", "=", lifecycle)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) !== 1) {
    throw new InvoiceAggregateConflictError("This invoice changed. Refresh the page and try again.");
  }

  await executor
    .deleteFrom("invoice_lines")
    .where("business_id", "=", invoice.business_id)
    .where("invoice_id", "=", invoice.id)
    .execute();
  await executor.insertInto("invoice_lines").values(aggregate.lines).execute();
}
