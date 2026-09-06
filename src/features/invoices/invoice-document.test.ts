import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InvoiceDocumentData } from "./document-data";
import { InvoiceDocument } from "./invoice-document";

const paidInvoice: InvoiceDocumentData = {
  number: "INV-2026-0042",
  title: "Invoice from Folio Studio",
  currency: "USD",
  locale: "en-US",
  seller: {
    name: "Folio Studio",
    address: ["1 Market Street", "London, EC1"],
    email: "billing@folio.test",
  },
  customer: {
    name: "Northwind & Co.",
    address: ["2 Harbour Road", "Toronto, Canada"],
  },
  issuedAt: "2026-06-24",
  dueAt: "2026-07-08",
  paidAt: "2026-06-24",
  status: {
    label: "Paid successfully",
    detail: "by bank transfer",
    tone: "paid",
  },
  lines: [
    {
      id: "line-1",
      description: "Brand & product design",
      details: "Discovery and final assets",
      quantity: 1,
      unitPrice: 2_001,
      amount: 2_001,
    },
  ],
  subtotal: 2_001,
  tax: 0,
  total: 2_001,
  amountPaid: 2_001,
  balanceDue: 0,
  footer: {
    brand: "Folio",
    message: "Thanks for working with Folio Studio!",
  },
};

describe("InvoiceDocument", () => {
  it("renders a semantic, escaped invoice preview", () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, {
        data: paidInvoice,
        className: "preview",
      }),
    );

    expect(html).toContain('<article class="invoice-document preview"');
    expect(html).toContain("<header");
    expect(html).toContain("<address");
    expect(html).toContain("<table");
    expect(html).toContain("<footer");
    expect(html).toContain("Northwind &amp; Co.");
    expect(html).toContain("Brand &amp; product design");
    expect(html).toContain("Jun 24, 2026");
    expect(html).toContain("Jul 8, 2026");
    expect(html).toContain("$20.01");
    expect(html).toContain(">Rate<");
    expect(html).toContain('data-tone="paid"');
    expect(html).toContain(">PAID SUCCESSFULLY<");
    expect(html).not.toContain("by bank transfer");
    expect(html).toContain("billing@folio.test");
    expect(html).toContain("Thanks for working with Folio Studio!");
  });

  it("does not repeat a draft status that is already the invoice number", () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, {
        data: {
          ...paidInvoice,
          number: "DRAFT",
          status: {
            label: "Draft",
            detail: "This invoice has not been issued",
          },
        },
      }),
    );

    expect(html.match(/>DRAFT</g)).toHaveLength(1);
    expect(html).not.toContain("This invoice has not been issued");
    expect(html).not.toContain("invoice-document__header-status");
  });

  it("keeps zero-value tax out and shows a settled balance explicitly", () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, { data: paidInvoice }),
    );

    expect(html).not.toContain(">Tax<");
    expect(html).toContain(">Balance due<");
    expect(html).toContain("$0.00");
    expect(html).toContain(">Amount paid<");
  });

  it("renders optional notes and payment instructions", () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, {
        data: {
          ...paidInvoice,
          notes: "Pay within 14 days.",
          paymentDetails: {
            heading: "Bank transfer",
            lines: ["IBAN GB00 FOLIO", "Reference INV-2026-0042"],
          },
        },
      }),
    );

    expect(html).toContain("Pay within 14 days.");
    expect(html).toContain("Bank transfer");
    expect(html).toContain("IBAN GB00 FOLIO\nReference INV-2026-0042");
  });
});
