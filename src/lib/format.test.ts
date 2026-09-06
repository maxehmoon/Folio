import { describe, expect, it } from "vitest";

import { todayInTimeZone } from "@/lib/format";

describe("todayInTimeZone", () => {
  it("uses the configured timezone for the current date", () => {
    const instant = new Date("2026-01-01T00:30:00.000Z");

    expect(todayInTimeZone("America/Los_Angeles", instant)).toBe("2025-12-31");
    expect(todayInTimeZone("Europe/Athens", instant)).toBe("2026-01-01");
  });
});
