import { describe, expect, it } from "vitest";

import { ensurePaymentFitsBalance, parsePaymentFormData } from "./forms";

function paymentForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    invoiceId: "invoice-1",
    currency: "GBP",
    paymentDate: "2026-07-22",
    amount: "24.50",
    method: "bank_transfer",
    reference: "BANK-001",
    notes: "Paid in full",
    ...overrides,
  };
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

describe("payment form parsing", () => {
  it("converts a positive amount to integer cents", () => {
    expect(parsePaymentFormData(paymentForm()).amountCents).toBe(2_450);
  });

  it.each(["0", "-1", "1.001", "not-money"])(
    "rejects invalid amount %s",
    (amount) => {
      expect(() => parsePaymentFormData(paymentForm({ amount }))).toThrow(
        /amount/i,
      );
    },
  );

  it("rejects impossible dates and unknown methods", () => {
    expect(() =>
      parsePaymentFormData(paymentForm({ paymentDate: "2026-02-31" })),
    ).toThrow("valid date");
    expect(() =>
      parsePaymentFormData(paymentForm({ method: "crypto" })),
    ).toThrow("valid payment method");
  });
});

describe("payment balance validation", () => {
  it("accepts an exact settlement and rejects an overpayment", () => {
    expect(() => ensurePaymentFitsBalance(5_000, 5_000)).not.toThrow();
    expect(() => ensurePaymentFitsBalance(5_001, 5_000)).toThrow(
      "greater than the amount due",
    );
  });
});
