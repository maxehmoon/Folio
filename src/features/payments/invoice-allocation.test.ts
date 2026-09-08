import { randomInt } from "node:crypto";
import { describe, expect, it } from "vitest";

import { paymentAmountInInvoiceCurrency, paymentExchangeSnapshot } from "./invoice-allocation";

describe("payment allocation after invoice currency edits", () => {
  it("uses the original receipt currency when changing back, without cumulative rounding", () => {
    const amount = randomInt(10_001, 70_000);
    const payment = { amount_cents: amount, currency: "USD", base_currency: "GBP", exchange_rate_micros: 750_000 };
    const euroInvoice = { currency: "EUR", base_currency: "GBP", exchange_rate_micros: 900_000 };
    const applied = paymentAmountInInvoiceCurrency(payment, euroInvoice);
    expect(applied).toBe(Math.floor(amount * 5 / 6 + 0.5));
    const changed = { ...payment, applied_amount_cents: applied };
    expect(paymentAmountInInvoiceCurrency(changed, { currency: "USD" })).toBe(amount);
    expect(paymentAmountInInvoiceCurrency(changed, euroInvoice)).toBe(applied);
  });

  it("rounds the cross-rate once, including a half-cent allocation", () => {
    // These deliberate boundary amounts expose premature base-currency rounding.
    const payment = { amount_cents: 1, currency: "USD", base_currency: "GBP", exchange_rate_micros: 500_000 };
    expect(paymentAmountInInvoiceCurrency(payment, {
      currency: "EUR", base_currency: "GBP", exchange_rate_micros: 2_000_000,
    })).toBe(0);
    expect(paymentAmountInInvoiceCurrency({ ...payment, amount_cents: 2 }, {
      currency: "EUR", base_currency: "GBP", exchange_rate_micros: 2_000_000,
    })).toBe(1);
  });

  it("handles a receipt in the invoice's base currency and the reverse direction", () => {
    const amount = randomInt(10_001, 70_000) * 2;
    expect(paymentAmountInInvoiceCurrency({ amount_cents: amount, currency: "GBP" }, {
      currency: "EUR", base_currency: "GBP", exchange_rate_micros: 2_000_000,
    })).toBe(amount / 2);
    expect(paymentAmountInInvoiceCurrency({
      amount_cents: amount, currency: "EUR", base_currency: "GBP", exchange_rate_micros: 500_000,
    }, { currency: "GBP" })).toBe(amount / 2);
  });

  it("requests a separate conversion when the frozen snapshots have no common currency", () => {
    const payment = { amount_cents: randomInt(10_001, 70_000), currency: "USD", base_currency: "GBP", exchange_rate_micros: 750_000 };
    expect(paymentAmountInInvoiceCurrency(payment, {
      currency: "EUR", base_currency: "CAD", exchange_rate_micros: 1_500_000,
    })).toBeNull();
    expect(paymentAmountInInvoiceCurrency({ ...payment, exchange_rate_micros: null }, {
      currency: "EUR", base_currency: "GBP", exchange_rate_micros: 900_000,
    })).toBeNull();
  });

  it("preserves an unavailable foreign receipt rate while recognising identity rates", () => {
    expect(paymentExchangeSnapshot({ currency: "USD", base_currency: "GBP", exchange_rate_micros: null }))
      .toMatchObject({ base_currency: "GBP", exchange_rate_micros: null });
    expect(paymentExchangeSnapshot({ currency: "GBP", base_currency: "GBP", exchange_rate_micros: null }))
      .toMatchObject({ base_currency: "GBP", exchange_rate_micros: 1_000_000 });
  });
});
