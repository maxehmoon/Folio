import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RECURRING_CHECK_INTERVAL_MS,
  startRecurringScheduler,
  stopRecurringScheduler,
} from "./scheduler";

const emptyResult = {
  businesses: 0,
  due: 0,
  generated: 0,
  skipped: 0,
  failed: 0,
  capped: 0,
  errors: [],
};

afterEach(() => {
  stopRecurringScheduler();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("recurring invoice scheduler", () => {
  it("checks on startup and once an hour", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue(emptyResult);

    startRecurringScheduler(run);
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RECURRING_CHECK_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("starts only one scheduler per process", () => {
    vi.useFakeTimers();
    const firstRun = vi.fn().mockResolvedValue(emptyResult);
    const secondRun = vi.fn().mockResolvedValue(emptyResult);

    startRecurringScheduler(firstRun);
    startRecurringScheduler(secondRun);

    expect(firstRun).toHaveBeenCalledTimes(1);
    expect(secondRun).not.toHaveBeenCalled();
  });

  it("logs aggregate diagnostics without recurring invoice error details", async () => {
    vi.useFakeTimers();
    vi.stubEnv("DEBUG", "true");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn().mockResolvedValue({
      ...emptyResult,
      due: 1,
      failed: 1,
      errors: [{
        recurringInvoiceId: "private-invoice-id",
        businessId: "private-business-id",
        message: "private-invoice-details",
      }],
    });

    startRecurringScheduler(run);
    await vi.advanceTimersByTimeAsync(0);

    expect(info).toHaveBeenCalledWith(
      "[Folio debug] recurring.check.completed",
      expect.objectContaining({ due: 1, generated: 0, failed: 1 }),
    );
    expect(error).toHaveBeenCalledExactlyOnceWith(
      "Recurring invoice check finished with 1 failure.",
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("private-");
    expect(JSON.stringify(error.mock.calls)).not.toContain("private-");
  });

  it("omits raw exceptions even when debug is enabled", async () => {
    vi.useFakeTimers();
    vi.stubEnv("DEBUG", "true");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = vi.fn().mockRejectedValue(
      new Error("postgres://user:private-password@database/folio"),
    );

    startRecurringScheduler(run);
    await vi.advanceTimersByTimeAsync(0);

    expect(info).toHaveBeenCalledWith(
      "[Folio debug] recurring.check.failed",
      { durationMs: expect.any(Number) },
    );
    expect(error).toHaveBeenCalledExactlyOnceWith(
      "Recurring invoice check failed.",
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("private-password");
    expect(JSON.stringify(error.mock.calls)).not.toContain("private-password");
  });
});
