import { afterEach, describe, expect, it, vi } from "vitest";

import { debugLog, type DebugFields } from "./logger";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("debug logging", () => {
  it.each([undefined, "", "0", "false", "off", "yes", "folio:*"])(
    "stays disabled when DEBUG is %s",
    (value) => {
      vi.stubEnv("DEBUG", value);
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      debugLog("startup.ready", { databaseDialect: "sqlite" });

      expect(info).not.toHaveBeenCalled();
    },
  );

  it.each(["1", "true", "TRUE", " true "])(
    "writes safe metadata when DEBUG is %s",
    (value) => {
      vi.stubEnv("DEBUG", value);
      const info = vi.spyOn(console, "info").mockImplementation(() => {});

      debugLog("startup.ready", {
        durationMs: 12,
        databaseDialect: "sqlite",
        appSecretSource: "generated",
        hasOwner: false,
      });

      expect(info).toHaveBeenCalledExactlyOnceWith(
        "[Folio debug] startup.ready",
        {
          durationMs: 12,
          databaseDialect: "sqlite",
          appSecretSource: "generated",
          hasOwner: false,
        },
      );
    },
  );

  it("omits secrets, raw errors, URLs and unexpected metadata at runtime", () => {
    vi.stubEnv("DEBUG", "true");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    debugLog("auth.request.completed", {
      status: 200,
      appSecret: "private-app-secret",
      setupToken: "private-setup-token",
      cookie: "session=private-cookie",
      headers: { authorization: "Bearer private-token" },
      databaseUrl: "postgres://user:password@database/folio",
      error: new Error("private-customer-details"),
      email: "customer@example.com",
      invoiceId: "private-invoice-id",
      message: "private-request-body",
    } as DebugFields);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      "[Folio debug] auth.request.completed",
      { status: 200 },
    );
  });

  it("rejects unexpected values even under allowed metadata keys", () => {
    vi.stubEnv("DEBUG", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    debugLog("startup.ready", {
      status: "private-secret",
      durationMs: Number.NaN,
      count: Number.POSITIVE_INFINITY,
      hasOwner: "private-email",
      databaseDialect: "postgres://user:password@database/folio",
      appSecretSource: "private-secret",
    } as unknown as DebugFields);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      "[Folio debug] startup.ready",
      {},
    );
  });
});
