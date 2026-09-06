import { describe, expect, it } from "vitest";

import { parseInvoiceFormData } from "./forms";

function invoiceForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const values = {
    customerId: "customer-1",
    currency: "GBP",
    issueDate: "2026-07-22",
    dueDate: "2026-08-05",
    notes: "Thank you",
    paymentInstructions: "Bank transfer",
    lines: JSON.stringify([
      {
        itemId: null,
        description: "Design work",
        unit: "hours",
        quantity: "1.25",
        unitPrice: "120.00",
        taxRate: "20",
      },
    ]),
    ...overrides,
  };

  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

describe("invoice form parsing", () => {
  it("converts submitted decimals to scaled integers", () => {
    expect(parseInvoiceFormData(invoiceForm()).lines[0]).toMatchObject({
      quantityThousandths: 1_250,
      unitPriceCents: 12_000,
      taxRateBps: 2_000,
    });
  });

  it("rejects inverted dates", () => {
    expect(() =>
      parseInvoiceFormData(invoiceForm({ dueDate: "2026-07-21" })),
    ).toThrow("Due date cannot be before");
  });

  it("rejects client-provided money with excess precision", () => {
    const lines = JSON.stringify([
      {
        description: "Design",
        unit: "hour",
        quantity: "1",
        unitPrice: "1.001",
        taxRate: "0",
      },
    ]);
    expect(() => parseInvoiceFormData(invoiceForm({ lines }))).toThrow(
      "no more than 2 decimal places",
    );
  });

  it("rejects unit prices beyond the shared database range", () => {
    const lines = JSON.stringify([
      {
        description: "Design",
        unit: "hour",
        quantity: "1",
        unitPrice: "21474836.48",
        taxRate: "0",
      },
    ]);

    expect(() => parseInvoiceFormData(invoiceForm({ lines }))).toThrow(
      "too large",
    );
  });
});
