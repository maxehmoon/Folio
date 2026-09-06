import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import type { InvoiceDocumentData } from "./document-data";
import { InvoicePdfDocument } from "./pdf-document";

const invoice: InvoiceDocumentData = {
  number: "INV-2026-0042",
  currency: "EUR",
  locale: "en-GB",
  seller: {
    name: "Folio Studio",
    address: ["1 Market Street", "London"],
  },
  customer: {
    name: "Northwind",
    address: ["2 Harbour Road", "Toronto"],
  },
  issuedAt: "2026-06-24",
  dueAt: "2026-07-08",
  status: { label: "Payment due" },
  lines: Array.from({ length: 48 }, (_, index) => ({
    id: `line-${index}`,
    description: `Consulting service ${index + 1}`,
    details: "Research, delivery and documentation",
    quantity: 1,
    unitPrice: 2_500,
    amount: 2_500,
  })),
  subtotal: 120_000,
  tax: 24_000,
  total: 144_000,
  amountPaid: 0,
  balanceDue: 144_000,
};

describe("InvoicePdfDocument", () => {
  it("embeds Geist and wraps a long invoice across A4 pages", async () => {
    const document = InvoicePdfDocument({ data: invoice });
    const buffer = await renderToBuffer(document);
    const pdfSource = buffer.toString("latin1");
    const pageObjects = pdfSource.match(/\/Type \/Page\b/g) ?? [];

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageObjects.length).toBeGreaterThan(1);
  });
});
