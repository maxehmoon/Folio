import { describe, expect, it } from "vitest";

import {
  calculateInvoiceTotals,
  calculateLine,
  deriveInvoiceStatus,
  invoiceBalance,
  parseMoneyInput,
} from "./money";

describe("calculateLine", () => {
  it("rounds once per line using integer arithmetic", () => {
    expect(
      calculateLine({
        quantityThousandths: 1_500,
        unitPriceCents: 1_001,
        taxRateBps: 2_000,
      }),
    ).toEqual({ subtotalCents: 1_502, taxCents: 300, totalCents: 1_802 });
  });

  it("rounds exact half cents away from zero", () => {
    expect(
      calculateLine({
        quantityThousandths: 500,
        unitPriceCents: 1,
        taxRateBps: 0,
      }).subtotalCents,
    ).toBe(1);
  });

  it("rejects invalid and unsafe inputs", () => {
    expect(() =>
      calculateLine({ quantityThousandths: 0, unitPriceCents: 100, taxRateBps: 0 }),
    ).toThrow();
    expect(() =>
      calculateLine({ quantityThousandths: 1_000, unitPriceCents: 100, taxRateBps: 10_001 }),
    ).toThrow();
    expect(() =>
      calculateLine({
        quantityThousandths: Number.MAX_SAFE_INTEGER,
        unitPriceCents: Number.MAX_SAFE_INTEGER,
        taxRateBps: 0,
      }),
    ).toThrow();
    expect(() =>
      calculateLine({
        quantityThousandths: 2_000,
        unitPriceCents: 2_147_483_647,
        taxRateBps: 0,
      }),
    ).toThrow("too large for the selected database");
  });
});

describe("invoice arithmetic", () => {
  it("sums already-rounded line totals", () => {
    expect(
      calculateInvoiceTotals([
        { subtotalCents: 101, taxCents: 20, totalCents: 121 },
        { subtotalCents: 202, taxCents: 40, totalCents: 242 },
      ]),
    ).toEqual({ subtotalCents: 303, taxCents: 60, totalCents: 363 });
  });

  it("rejects invoice totals beyond the shared database range", () => {
    expect(() =>
      calculateInvoiceTotals([
        { subtotalCents: 2_000_000_000, taxCents: 0, totalCents: 2_000_000_000 },
        { subtotalCents: 200_000_000, taxCents: 0, totalCents: 200_000_000 },
      ]),
    ).toThrow("too large for the selected database");
  });

  it("does not return a negative invoice balance", () => {
    expect(invoiceBalance(300, 350)).toBe(0);
  });

  it("derives status without storing payment state", () => {
    const base = {
      dueDate: "2026-07-21",
      totalCents: 1_000,
      paidCents: 0,
      today: "2026-07-22",
    } as const;

    expect(deriveInvoiceStatus({ ...base, lifecycle: "draft" })).toBe("draft");
    expect(deriveInvoiceStatus({ ...base, lifecycle: "void" })).toBe("void");
    expect(deriveInvoiceStatus({ ...base, lifecycle: "issued" })).toBe("overdue");
    expect(
      deriveInvoiceStatus({ ...base, lifecycle: "issued", paidCents: 100 }),
    ).toBe("overdue");
    expect(
      deriveInvoiceStatus({ ...base, lifecycle: "issued", paidCents: 1_000 }),
    ).toBe("paid");
    expect(
      deriveInvoiceStatus({
        ...base,
        lifecycle: "issued",
        dueDate: base.today,
        paidCents: 100,
      }),
    ).toBe("partially_paid");
  });
});

describe("parseMoneyInput", () => {
  it("parses decimal strings directly into cents", () => {
    expect(parseMoneyInput("0.10")).toBe(10);
    expect(parseMoneyInput("12.3")).toBe(1_230);
    expect(parseMoneyInput("42")).toBe(4_200);
  });

  it("rejects precision loss and negative amounts", () => {
    expect(() => parseMoneyInput("1.005")).toThrow();
    expect(() => parseMoneyInput("-1")).toThrow();
  });
});
