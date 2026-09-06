import { describe, expect, it } from "vitest";

import { defaultReportRange, lastSixMonths, parseDateRange } from "./range";

describe("report date ranges", () => {
  it("builds a six-month chart without mutating the input date", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    expect(lastSixMonths(now).map((point) => point.key)).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
    expect(now.toISOString()).toBe("2026-07-22T12:00:00.000Z");
  });

  it("uses a year-to-date range by default", () => {
    expect(defaultReportRange(new Date("2026-07-22T12:00:00Z"))).toEqual({
      from: "2026-01-01",
      to: "2026-07-22",
    });
    expect(defaultReportRange("2025-12-31")).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("orders a reversed custom range", () => {
    expect(parseDateRange("2026-07-20", "2026-07-01")).toEqual({
      from: "2026-07-01",
      to: "2026-07-20",
    });
  });

  it("falls back for impossible calendar dates", () => {
    expect(
      parseDateRange("2026-02-31", "2026-03-05", {
        from: "2026-01-01",
        to: "2026-03-06",
      }),
    ).toEqual({ from: "2026-01-01", to: "2026-03-05" });
  });
});
