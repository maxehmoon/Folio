import { describe, expect, it } from "vitest";

import {
  calculateInvoice,
  calculateInvoiceLine,
  deriveInvoiceStatus,
  formatQuantity,
  parseQuantity,
} from "./calculations";

describe("invoice calculations", () => {
  it("parses quantities without floating-point arithmetic", () => {
    expect(parseQuantity("2.125")).toBe(2_125);
    expect(formatQuantity(2_125)).toBe("2.125");
    expect(formatQuantity(2_000)).toBe("2");
  });

  it("rejects invalid or overly precise quantities", () => {
    expect(() => parseQuantity("0")).toThrow();
    expect(() => parseQuantity("1.0001")).toThrow();
    expect(() => parseQuantity("1e2")).toThrow();
  });

  it("rounds each line subtotal and tax to integer cents", () => {
    expect(
      calculateInvoiceLine({
        quantityThousandths: 1_500,
        unitPriceCents: 1_001,
        taxRateBps: 2_000,
      }),
    ).toEqual({ subtotalCents: 1_502, taxCents: 300, totalCents: 1_802 });
  });

  it("totals server-calculated lines", () => {
    expect(
      calculateInvoice([
        { quantityThousandths: 1_000, unitPriceCents: 2_500, taxRateBps: 0 },
        { quantityThousandths: 2_000, unitPriceCents: 500, taxRateBps: 1_000 },
      ]),
    ).toEqual({ subtotalCents: 3_500, taxCents: 100, totalCents: 3_600 });
  });
});

describe("invoice status", () => {
  const base = {
    lifecycle: "issued" as const,
    totalCents: 10_000,
    paidCents: 0,
    dueDate: "2026-07-31",
    today: "2026-07-22",
  };

  it("derives payment and due-date states", () => {
    expect(deriveInvoiceStatus(base)).toBe("issued");
    expect(deriveInvoiceStatus({ ...base, paidCents: 4_000 })).toBe(
      "partially_paid",
    );
    expect(deriveInvoiceStatus({ ...base, paidCents: 10_000 })).toBe("paid");
    expect(
      deriveInvoiceStatus({ ...base, dueDate: "2026-07-21" }),
    ).toBe("overdue");
  });

  it("keeps lifecycle states authoritative", () => {
    expect(deriveInvoiceStatus({ ...base, lifecycle: "draft" })).toBe("draft");
    expect(deriveInvoiceStatus({ ...base, lifecycle: "void" })).toBe("void");
  });
});
