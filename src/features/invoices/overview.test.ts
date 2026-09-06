import { describe, expect, it } from "vitest";

import { summariseInvoiceOverview } from "./overview";

describe("summariseInvoiceOverview", () => {
  it("uses saved exchange snapshots for every outstanding balance", () => {
    const overview = summariseInvoiceOverview(
      [
        {
          lifecycle: "issued",
          total_cents: 10_000,
          paid_cents: 2_000,
          due_date: "2026-08-01",
          currency: "EUR",
          base_currency: "GBP",
          exchange_rate_micros: 800_000,
        },
        {
          lifecycle: "issued",
          total_cents: 1_500,
          paid_cents: 1_500,
          due_date: "2026-08-20",
          currency: "GBP",
          base_currency: "GBP",
          exchange_rate_micros: 1_000_000,
        },
        {
          lifecycle: "draft",
          total_cents: 2_000,
          paid_cents: 0,
          due_date: null,
          currency: "GBP",
          base_currency: "GBP",
          exchange_rate_micros: 1_000_000,
        },
      ],
      "GBP",
      "2026-08-14",
    );

    expect(overview).toEqual({
      amountDueCents: 6_400,
      draftCount: 1,
      issuedCount: 2,
      overdueCount: 1,
      paidCount: 1,
      totalCount: 3,
      unconvertedAmountDueCount: 0,
    });
  });

  it("does not silently treat an invoice without a usable rate as zero-rate debt", () => {
    expect(
      summariseInvoiceOverview(
        [
          {
            lifecycle: "issued",
            total_cents: 10_000,
            paid_cents: 0,
            due_date: null,
            currency: "USD",
            base_currency: null,
            exchange_rate_micros: null,
          },
        ],
        "GBP",
        "2026-08-14",
      ),
    ).toMatchObject({
      amountDueCents: 0,
      issuedCount: 1,
      unconvertedAmountDueCount: 1,
    });
  });
});
