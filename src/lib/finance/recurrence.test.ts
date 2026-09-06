import { describe, expect, it } from "vitest";

import {
  addPaymentTerms,
  advanceSchedule,
  occurrenceAt,
} from "./recurrence";

describe("occurrenceAt", () => {
  it("uses the original monthly anchor and avoids clamp drift", () => {
    const schedule = {
      startsOn: "2024-01-31",
      frequency: "month" as const,
      intervalCount: 1,
    };

    expect(occurrenceAt(schedule, 0)).toBe("2024-01-31");
    expect(occurrenceAt(schedule, 1)).toBe("2024-02-29");
    expect(occurrenceAt(schedule, 2)).toBe("2024-03-31");
  });

  it("restores leap day in later leap years", () => {
    const schedule = {
      startsOn: "2024-02-29",
      frequency: "year" as const,
      intervalCount: 1,
    };

    expect(occurrenceAt(schedule, 1)).toBe("2025-02-28");
    expect(occurrenceAt(schedule, 4)).toBe("2028-02-29");
  });

  it("adds day and week intervals in UTC", () => {
    expect(
      occurrenceAt(
        { startsOn: "2026-03-28", frequency: "day", intervalCount: 1 },
        2,
      ),
    ).toBe("2026-03-30");
    expect(
      occurrenceAt(
        { startsOn: "2026-07-01", frequency: "week", intervalCount: 2 },
        1,
      ),
    ).toBe("2026-07-15");
  });
});

describe("recurrence progression", () => {
  it("treats the schedule end date as inclusive", () => {
    const schedule = {
      startsOn: "2026-01-01",
      endsOn: "2026-03-01",
      frequency: "month" as const,
      intervalCount: 1,
    };

    expect(advanceSchedule(schedule, 2).nextIssueDate).toBeNull();
  });

  it("rejects invalid schedules and indices", () => {
    expect(() =>
      occurrenceAt(
        { startsOn: "2026-01-01", frequency: "month", intervalCount: 0 },
        0,
      ),
    ).toThrow();
    expect(() =>
      occurrenceAt(
        { startsOn: "2026-02-30", frequency: "month", intervalCount: 1 },
        0,
      ),
    ).toThrow();
  });

  it("adds non-negative payment terms", () => {
    expect(addPaymentTerms("2024-02-28", 2)).toBe("2024-03-01");
    expect(() => addPaymentTerms("2024-02-28", -1)).toThrow();
  });
});
