import { describe, expect, it } from "vitest";

import { convertCents, convertToBaseCurrency } from "./exchange";

describe("currency conversion", () => {
  it("supports rates beyond PostgreSQL's 32-bit integer range", () => {
    expect(convertCents(100, 20_000_000_000)).toBe(2_000_000);
  });

  it("returns an explicit state when a compatible stored rate is unavailable", () => {
    expect(
      convertToBaseCurrency({
        amountCents: 10_000,
        currency: "USD",
        baseCurrency: "GBP",
        storedBaseCurrency: "EUR",
        rateMicros: 800_000,
      }),
    ).toEqual({
      status: "missing-rate",
      reason: "base-currency-mismatch",
    });
    expect(
      convertToBaseCurrency({
        amountCents: 10_000,
        currency: "USD",
        baseCurrency: "GBP",
        storedBaseCurrency: "GBP",
        rateMicros: null,
      }),
    ).toEqual({ status: "missing-rate", reason: "missing-rate" });
  });

  it("rejects invalid integer boundaries instead of rounding silently", () => {
    expect(() => convertCents(100, 0)).toThrow(RangeError);
    expect(() => convertCents(Number.MAX_SAFE_INTEGER + 1, 800_000)).toThrow(
      RangeError,
    );
  });
});
