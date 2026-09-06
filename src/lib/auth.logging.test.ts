import type { BetterAuthOptions } from "better-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { handler } = vi.hoisted(() => ({ handler: vi.fn() }));

vi.mock("better-auth", () => ({ betterAuth: () => ({ handler }) }));
vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "test-next-cookies" }),
}));
vi.mock("@/lib/db", () => ({
  db: {},
  getDatabaseDialect: () => "sqlite",
}));

let auth: typeof import("./auth");
let route: typeof import("@/app/api/auth/[...all]/route");

beforeEach(async () => {
  vi.resetModules();
  handler.mockReset();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DEBUG", "false");
  vi.stubEnv("APP_SECRET", "private-app-secret");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth = await import("./auth");
  route = await import("@/app/api/auth/[...all]/route");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

function signInRequest() {
  return new Request("http://folio.test:3456/api/auth/sign-in/email?private-query=secret", {
    method: "POST",
    headers: {
      host: "folio.test:3456",
      origin: "http://folio.test:3456",
      "content-type": "application/json",
      authorization: "Bearer private-authorization-token",
      cookie: "folio.session_token=private-session-token",
    },
    body: JSON.stringify({
      email: "private-email@example.com",
      password: "private-password",
      setupToken: "private-setup-token",
    }),
  });
}

function libraryLog(level: "debug" | "info" | "warn" | "error") {
  const logger: NonNullable<BetterAuthOptions["logger"]> = auth.authOptions.logger;
  logger.log!(
    level,
    "private-library-message for private-email@example.com",
    new Error("postgres://user:private-password@database/folio"),
    {
      password: "private-password",
      authorization: "Bearer private-authorization-token",
      cookie: "folio.session_token=private-session-token",
    },
  );
}

function expectNoPrivateData() {
  expect(JSON.stringify([
    vi.mocked(console.info).mock.calls,
    vi.mocked(console.warn).mock.calls,
    vi.mocked(console.error).mock.calls,
  ])).not.toContain("private-");
}

describe("authentication diagnostic privacy", () => {
  it("does not emit route or library diagnostics with DEBUG disabled", async () => {
    handler.mockResolvedValue(Response.json({ ok: true }));

    expect((await route.POST(signInRequest())).status).toBe(200);
    libraryLog("debug");
    libraryLog("info");

    expect(handler).toHaveBeenCalledOnce();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs only status and timing for a completed request with DEBUG enabled", async () => {
    vi.stubEnv("DEBUG", "true");
    const response = Response.json(
      { error: "private-response-body" },
      { status: 401, headers: { "set-cookie": "folio.session_token=private-response-cookie" } },
    );
    handler.mockResolvedValue(response);

    expect(await route.POST(signInRequest())).toBe(response);

    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      "[Folio debug] auth.request.completed",
      { status: 401, durationMs: expect.any(Number) },
    );
    expectNoPrivateData();
  });

  it("logs only timing when a request throws without swallowing its failure", async () => {
    vi.stubEnv("DEBUG", "true");
    const error = new Error("private-request-error with private-password");
    handler.mockRejectedValue(error);

    await expect(route.POST(signInRequest())).rejects.toBe(error);

    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      "[Folio debug] auth.request.failed",
      { durationMs: expect.any(Number) },
    );
    expectNoPrivateData();
  });

  it.each(["false", "true"])(
    "drops library messages and arguments at every level with DEBUG=%s",
    (debug) => {
      vi.stubEnv("DEBUG", debug);

      libraryLog("debug");
      libraryLog("info");
      libraryLog("warn");
      libraryLog("error");

      if (debug === "true") {
        expect(console.info).toHaveBeenCalledTimes(2);
        expect(console.info).toHaveBeenCalledWith("[Folio debug] auth.library.debug", {});
        expect(console.info).toHaveBeenCalledWith("[Folio debug] auth.library.info", {});
      } else {
        expect(console.info).not.toHaveBeenCalled();
      }
      expect(console.warn).toHaveBeenCalledExactlyOnceWith(
        "Folio authentication reported a warning.",
      );
      expect(console.error).toHaveBeenCalledExactlyOnceWith(
        "Folio authentication encountered an error.",
      );
      expectNoPrivateData();
    },
  );
});
