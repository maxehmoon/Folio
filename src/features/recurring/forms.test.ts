import { describe, expect, it } from "vitest";

import { parseRecurringInvoiceFormData } from "./forms";

function recurringForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    customerId: "customer-1",
    frequency: "month",
    intervalCount: "1",
    startsOn: "2026-07-31",
    endsOn: "",
    paymentTermsDays: "14",
    currency: "gbp",
    notes: "Thank you",
    paymentInstructions: "Bank transfer",
    lines: JSON.stringify([
      {
        itemId: null,
        description: "Design retainer",
        unit: "month",
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

describe("recurring invoice form parsing", () => {
  it("normalises the schedule, currency and line amounts", () => {
    expect(parseRecurringInvoiceFormData(recurringForm())).toMatchObject({
      frequency: "month",
      intervalCount: 1,
      startsOn: "2026-07-31",
      endsOn: null,
      paymentTermsDays: 14,
      currency: "GBP",
      lines: [
        {
          quantityThousandths: 1_250,
          unitPriceCents: 12_000,
          taxRateBps: 2_000,
        },
      ],
    });
  });

  it("requires at least one line and an ordered date range", () => {
    expect(() =>
      parseRecurringInvoiceFormData(
        recurringForm({ startsOn: "2026-08-01", endsOn: "2026-07-31" }),
      ),
    ).toThrow("End date cannot be before");
    expect(() =>
      parseRecurringInvoiceFormData(recurringForm({ lines: "[]" })),
    ).toThrow("at least one line");
  });

  it("rejects totals that cannot be stored by the PostgreSQL schema", () => {
    const lines = JSON.stringify([
      {
        itemId: null,
        description: "Oversized retainer",
        unit: "month",
        quantity: "1000",
        unitPrice: "100000.00",
        taxRate: "20",
      },
    ]);

    expect(() =>
      parseRecurringInvoiceFormData(recurringForm({ lines })),
    ).toThrow("too large");
  });
});
