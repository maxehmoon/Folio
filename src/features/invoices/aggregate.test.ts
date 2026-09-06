import { describe, expect, it } from "vitest";

import type {
  Business,
  Customer,
  Invoice,
  InvoiceLine,
  InvoiceStatus,
} from "@/lib/db/types";

import { prepareInvoiceAggregate } from "./aggregate";
import { buildInvoiceDocumentData } from "./document-mapper";

const timestamp = "2026-08-14T09:00:00.000Z";
const business: Business = {
  id: "business-1",
  owner_user_id: "owner-1",
  name: "Folio Studio",
  legal_name: "Folio Studio Ltd",
  email: "billing@folio.test",
  phone: "+44 20 7946 0000",
  tax_id: "GB123",
  address_line_1: "1 Studio Way",
  address_line_2: null,
  city: "London",
  region: null,
  postal_code: "N1 1AA",
  country_code: "GB",
  currency: "GBP",
  timezone: "Europe/London",
  invoice_prefix: "FOL",
  next_invoice_number: 42,
  default_payment_terms_days: 14,
  payment_instructions: "Bank transfer",
  invoice_footer: "Registered in England and Wales.",
  logo_url: null,
  created_at: timestamp,
  updated_at: timestamp,
};
const customer: Customer = {
  id: "customer-1",
  business_id: business.id,
  name: "Northstar Design",
  avatar_data_url: null,
  default_currency: "EUR",
  contact_name: "Alex North",
  email: "accounts@northstar.test",
  phone: "+33 1 55 55 55 55",
  tax_id: "FR123",
  address_line_1: "2 Client Road",
  address_line_2: "Suite 4",
  city: "Paris",
  region: null,
  postal_code: "75001",
  country_code: "FR",
  notes: null,
  archived_at: null,
  created_at: timestamp,
  updated_at: timestamp,
};
const lines = [
  {
    itemId: "item-1",
    description: "Design retainer",
    unit: "month",
    quantityThousandths: 1_500,
    unitPriceCents: 10_000,
    taxRateBps: 2_000,
  },
];
const exchangeRate = {
  base: "EUR",
  quote: "GBP",
  rateMicros: 850_000,
  date: "2026-08-14",
  source: "ECB",
};

function aggregateFor(
  id: string,
  lifecycle: "draft" | "issued",
  recurringInvoiceId: string | null,
) {
  let lineIndex = 0;
  return prepareInvoiceAggregate(
    {
      id,
      business,
      customer,
      recurringInvoiceId,
      recurrenceIndex: recurringInvoiceId ? 3 : null,
      invoiceNumber: lifecycle === "issued" ? "FOL-000042" : null,
      lifecycle,
      issueDate: "2026-08-14",
      dueDate: "2026-08-28",
      currency: "EUR",
      exchangeRate,
      notes: "Thank you",
      paymentInstructions: "Use reference FOL-000042",
      lines,
      timestamp,
    },
    () => `${id}-line-${++lineIndex}`,
  );
}

describe("prepareInvoiceAggregate", () => {
  it("gives manual and recurring invoices the same financial and party snapshots", () => {
    const manual = aggregateFor("manual-1", "draft", null);
    const recurring = aggregateFor("generated-1", "issued", "recurring-1");
    const snapshot = (invoice: typeof manual.invoice) => ({
      currency: invoice.currency,
      baseCurrency: invoice.base_currency,
      exchangeRateMicros: invoice.exchange_rate_micros,
      exchangeRateDate: invoice.exchange_rate_date,
      exchangeRateSource: invoice.exchange_rate_source,
      sellerName: invoice.seller_name,
      sellerEmail: invoice.seller_email,
      sellerPhone: invoice.seller_phone,
      sellerTaxId: invoice.seller_tax_id,
      sellerAddress: invoice.seller_address,
      customerName: invoice.customer_name,
      customerEmail: invoice.customer_email,
      customerPhone: invoice.customer_phone,
      customerTaxId: invoice.customer_tax_id,
      customerAddress: invoice.customer_address,
      invoiceFooter: invoice.invoice_footer,
      subtotalCents: invoice.subtotal_cents,
      taxCents: invoice.tax_cents,
      totalCents: invoice.total_cents,
    });

    expect(snapshot(recurring.invoice)).toEqual(snapshot(manual.invoice));
    expect(snapshot(recurring.invoice)).toMatchObject({
      baseCurrency: "GBP",
      exchangeRateMicros: 850_000,
      sellerPhone: "+44 20 7946 0000",
      customerPhone: "+33 1 55 55 55 55",
      invoiceFooter: "Registered in England and Wales.",
      subtotalCents: 15_000,
      taxCents: 3_000,
      totalCents: 18_000,
    });
    expect(
      recurring.lines.map(
        ({
          description,
          quantity_thousandths,
          unit_price_cents,
          subtotal_cents,
          tax_cents,
          total_cents,
        }) => ({
          description,
          quantity_thousandths,
          unit_price_cents,
          subtotal_cents,
          tax_cents,
          total_cents,
        }),
      ),
    ).toEqual(
      manual.lines.map(
        ({
          description,
          quantity_thousandths,
          unit_price_cents,
          subtotal_cents,
          tax_cents,
          total_cents,
        }) => ({
          description,
          quantity_thousandths,
          unit_price_cents,
          subtotal_cents,
          tax_cents,
          total_cents,
        }),
      ),
    );
  });

  it("builds documents only from the immutable invoice aggregate", () => {
    const aggregate = aggregateFor("generated-1", "issued", "recurring-1");
    const data = buildInvoiceDocumentData({
      invoice: aggregate.invoice as Invoice,
      lines: aggregate.lines as InvoiceLine[],
      payments: [],
      paidCents: 0,
      balanceDueCents: 18_000,
      status: "issued",
    });

    business.name = "Renamed Studio";
    business.phone = null;
    business.invoice_footer = "New footer";
    customer.name = "Renamed Customer";
    customer.phone = null;

    expect(data).toMatchObject({
      seller: {
        name: "Folio Studio Ltd",
        phone: "+44 20 7946 0000",
      },
      customer: {
        name: "Northstar Design",
        phone: "+33 1 55 55 55 55",
      },
      footer: {
        message: "Registered in England and Wales.",
      },
    });
  });

  it.each<[
    InvoiceStatus,
    { label: string; tone: "danger" | "neutral" | "paid" | "warning" },
  ]>([
    ["draft", { label: "Draft", tone: "neutral" }],
    ["issued", { label: "Outstanding", tone: "neutral" }],
    ["partially_paid", { label: "Part-paid", tone: "warning" }],
    ["paid", { label: "Paid", tone: "paid" }],
    ["overdue", { label: "Overdue", tone: "danger" }],
    ["void", { label: "Void", tone: "neutral" }],
  ])("uses one concise status for %s invoices", (status, expected) => {
    const aggregate = aggregateFor("status-1", "issued", null);
    const data = buildInvoiceDocumentData({
      invoice: aggregate.invoice as Invoice,
      lines: aggregate.lines as InvoiceLine[],
      payments: [],
      paidCents: status === "paid" ? 18_000 : 0,
      balanceDueCents: status === "paid" ? 0 : 18_000,
      status,
    });

    expect(data.status).toEqual(expected);
  });

  it("does not invent generic footer copy", () => {
    const aggregate = aggregateFor("footer-1", "issued", null);
    const data = buildInvoiceDocumentData({
      invoice: {
        ...aggregate.invoice,
        invoice_footer: null,
      } as Invoice,
      lines: aggregate.lines as InvoiceLine[],
      payments: [],
      paidCents: 0,
      balanceDueCents: 18_000,
      status: "issued",
    });

    expect(data.footer).toEqual({ brand: "Folio Studio Ltd" });
  });
});
