import { describe, expect, it } from "vitest";

import type { FinancialEntry, FinancialEntryKind } from "@/features/finance/ledger";

import { buildReportInsights } from "./insights";
import { reportChartBuckets } from "./range";

let seed = 86291;
function syntheticNumber() {
  seed = (seed * 48271) % 2147483647;
  return seed;
}

function syntheticEntry(kind: FinancialEntryKind, date: string): FinancialEntry {
  return {
    id: `synthetic-entry-${syntheticNumber()}`,
    kind,
    date,
    reference: `synthetic-reference-${syntheticNumber()}`,
    party: `Fictional party ${syntheticNumber()}`,
    description: `Synthetic report entry ${syntheticNumber()}`,
    amountCents: syntheticNumber() % 100_000,
    currency: "GBP",
    baseConversion: { status: "converted", amountCents: syntheticNumber() % 100_000 },
    rateDate: null,
    rateSource: null,
  };
}

describe("report chart buckets", () => {
  it("includes both daily boundaries and leap days, then switches after 31 days", () => {
    const daily = reportChartBuckets({ from: "2072-02-01", to: "2072-03-02" });
    expect(daily.granularity).toBe("day");
    expect(daily.points).toHaveLength(31);
    expect(daily.points.at(0)?.key).toBe("2072-02-01");
    expect(daily.points.at(-1)?.key).toBe("2072-03-02");
    expect(daily.points.some(({ key }) => key === "2072-02-29")).toBe(true);
    const monthly = reportChartBuckets({ from: "2072-02-01", to: "2072-03-03" });
    expect(monthly.granularity).toBe("month");
    expect(monthly.points.map(({ label }) => label)).toEqual(["Feb 2072", "Mar 2072"]);
  });

  it("uses up to 24 monthly buckets and yearly buckets for longer ranges", () => {
    const monthly = reportChartBuckets({ from: "2083-01-15", to: "2084-12-12" });
    expect(monthly.granularity).toBe("month");
    expect(monthly.points).toHaveLength(24);
    const yearly = reportChartBuckets({ from: "2083-01-15", to: "2085-01-12" });
    expect(yearly.granularity).toBe("year");
    expect(yearly.points.map(({ key }) => key)).toEqual(["2083", "2084", "2085"]);
  });

  it("preserves early years and bounds the widest supported range", () => {
    const early = reportChartBuckets({ from: "0099-12-31", to: "0100-01-01" });
    expect(early.points.map(({ label }) => label)).toEqual(["31 Dec 0099", "1 Jan 0100"]);
    const widest = reportChartBuckets({ from: "0000-01-01", to: "9999-12-31" });
    expect(widest.granularity).toBe("year");
    expect(widest.points).toHaveLength(10_000);
    expect(widest.points.at(0)?.label).toBe("0000");
    expect(widest.points.at(-1)?.label).toBe("9999");
  });
});

describe("report insights", () => {
  it("uses converted amounts, keeps empty days and excludes missing rates from totals and counts", () => {
    const sale = syntheticEntry("sale", "2072-02-02");
    const receipt = syntheticEntry("receipt", "2072-02-04");
    const expense = syntheticEntry("expense", "2072-02-08");
    const missing = syntheticEntry("expense", "2072-02-03");
    missing.baseConversion = { status: "missing-rate", reason: "missing-rate" };
    const category = `Synthetic category ${syntheticNumber()}`;
    const result = buildReportInsights(
      [sale, receipt, expense, missing, syntheticEntry("sale", "2072-02-01")],
      { from: "2072-02-02", to: "2072-02-08" },
      new Map([[expense.id, category], [missing.id, "Excluded synthetic category"]]),
    );
    expect(result.points).toHaveLength(7);
    expect(result.points.at(0)?.salesCents).toBe(
      sale.baseConversion.status === "converted" ? sale.baseConversion.amountCents : 0,
    );
    expect(result.points[2].receiptsCents).toBe(
      receipt.baseConversion.status === "converted" ? receipt.baseConversion.amountCents : 0,
    );
    expect(result.points[1]).toMatchObject({ salesCents: 0, receiptsCents: 0, expensesCents: 0 });
    expect(result.expenseCategories).toEqual([{
      category,
      totalCents: expense.baseConversion.status === "converted" ? expense.baseConversion.amountCents : 0,
    }]);
    expect(result).toMatchObject({ invoiceCount: 1, receiptCount: 1, expenseCount: 1 });
  });

  it("combines category amounts and keeps uncategorised expenses in the breakdown", () => {
    const entries = Array.from({ length: 3 }, () => syntheticEntry("expense", "2086-05-12"));
    const category = `Synthetic category ${syntheticNumber()}`;
    const result = buildReportInsights(
      entries,
      { from: "2086-01-01", to: "2086-12-31" },
      new Map([[entries[0].id, category], [entries[1].id, category]]),
    );
    const amounts = entries.map(({ baseConversion }) => baseConversion.status === "converted" ? baseConversion.amountCents : 0);
    expect(result.points[4].expensesCents).toBe(amounts.reduce((sum, amount) => sum + amount, 0));
    expect(result.expenseCategories).toEqual(expect.arrayContaining([
      { category, totalCents: amounts[0] + amounts[1] },
      { category: "Uncategorised", totalCents: amounts[2] },
    ]));
    expect(result.expenseCategories[0].totalCents).toBeGreaterThanOrEqual(result.expenseCategories[1].totalCents);
  });

  it("rejects totals beyond the safe integer range", () => {
    const entries = Array.from({ length: 2 }, () => syntheticEntry("receipt", "2092-06-09"));
    entries[0].baseConversion = { status: "converted", amountCents: Number.MAX_SAFE_INTEGER };
    entries[1].baseConversion = { status: "converted", amountCents: 1 };
    expect(() => buildReportInsights(entries, { from: "2092-06-09", to: "2092-06-09" }, new Map())).toThrow(RangeError);
  });
});
