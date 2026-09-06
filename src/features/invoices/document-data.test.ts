import { describe, expect, it } from "vitest";
import {
  createInvoiceDocumentViewModel,
  formatDate,
  formatMoney,
  formatQuantity,
  getInvoiceDocumentLabels,
  type InvoiceDocumentData,
} from "./document-data";

const invoice: InvoiceDocumentData = {
  number: "INV-0042",
  currency: "USD",
  locale: "en-US",
  seller: {
    name: "Folio Studio",
    address: ["1 Market Street", "London"],
    email: "accounts@example.com",
  },
  customer: {
    name: "Northwind",
    address: ["2 Harbour Road", "Toronto"],
  },
  issuedAt: "2026-06-24",
  dueAt: "2026-07-08",
  status: { label: "Payment due", tone: "neutral" },
  lines: [
    {
      id: "line-1",
      description: "Design services",
      quantity: 2,
      unit: "hours",
      unitPrice: 5_000,
      amount: 10_000,
    },
  ],
  subtotal: 10_000,
  tax: 2_000,
  total: 12_000,
  amountPaid: 4_000,
  balanceDue: 8_000,
};

describe("invoice document formatting", () => {
  it("formats integer hundredths consistently across currencies", () => {
    expect(formatMoney(2_001, "USD", "en-US")).toBe("$20.01");
    expect(formatMoney(2_001, "JPY", "en-US")).toBe("¥20");
    expect(formatMoney(-99, "USD", "en-US")).toBe("-$0.99");
  });

  it("formats date-only values without a host time-zone shift", () => {
    expect(formatDate("2026-06-24", "en-US")).toBe("Jun 24, 2026");
    expect(formatDate("2026-06-24", "en-GB")).toBe("24 Jun 2026");
  });

  it("formats quantities with optional units", () => {
    expect(formatQuantity(1.5, "hours", "en-US")).toBe("1.5 hours");
    expect(formatQuantity(2, undefined, "en-US")).toBe("2");
  });

  it("merges copy overrides without mutating the defaults", () => {
    const labels = getInvoiceDocumentLabels({ billTo: "Customer" });

    expect(labels.billTo).toBe("Customer");
    expect(labels.billFrom).toBe("Bill from");
  });
});

describe("InvoiceDocumentData", () => {
  it("round-trips as plain JSON", () => {
    expect(JSON.parse(JSON.stringify(invoice))).toEqual(invoice);
  });

  it("derives shared date and total rows for both renderers", () => {
    const view = createInvoiceDocumentViewModel(invoice);

    expect(view.dates.map((row) => row.key)).toEqual(["issued", "due"]);
    expect(view.headerStatus).toBe("PAYMENT DUE");
    expect(view.totals.map((row) => row.key)).toEqual([
      "subtotal",
      "tax",
      "total",
      "amount-paid",
      "balance-due",
    ]);
  });

  it("omits a status that only repeats the invoice number", () => {
    const view = createInvoiceDocumentViewModel({
      ...invoice,
      number: "DRAFT",
      status: {
        label: "Draft",
        detail: "This invoice has not been issued",
      },
    });

    expect(view.headerStatus).toBeUndefined();
  });
});
