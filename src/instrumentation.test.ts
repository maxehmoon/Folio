import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  ensureRuntimeSecrets,
  firstRunSetupMessage,
  readSetupDefaults,
  hasOwner,
  migrateDatabase,
  startRecurringScheduler,
} = vi.hoisted(() => ({
  ensureRuntimeSecrets: vi.fn(),
  firstRunSetupMessage: vi.fn(),
  readSetupDefaults: vi.fn(),
  hasOwner: vi.fn(),
  migrateDatabase: vi.fn(),
  startRecurringScheduler: vi.fn(),
}));

vi.mock("@/lib/setup/runtime-secrets", () => ({ ensureRuntimeSecrets }));
vi.mock("@/lib/setup/boot-message", () => ({ firstRunSetupMessage }));
vi.mock("@/lib/setup/defaults", () => ({ readSetupDefaults }));
vi.mock("@/lib/setup/owner-claim", () => ({ hasOwner }));
vi.mock("@/lib/db", () => ({
  migrateDatabase,
  getDatabaseDialect: () => "sqlite",
}));
vi.mock("@/features/recurring/scheduler", () => ({ startRecurringScheduler }));

import { register } from "./instrumentation";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("DEBUG", "false");
  vi.stubEnv("APP_SECRET", undefined);
  vi.stubEnv("BETTER_AUTH_SECRET", undefined);
  ensureRuntimeSecrets.mockResolvedValue({
    authenticationSecretCreated: false,
    configDirectory: "/data",
    setupToken: "private-setup-token",
  });
  firstRunSetupMessage.mockReturnValue(null);
  hasOwner.mockResolvedValue(true);
  migrateDatabase.mockResolvedValue(undefined);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("startup diagnostics", () => {
  it("does not initialise application services outside the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(readSetupDefaults).not.toHaveBeenCalled();
    expect(ensureRuntimeSecrets).not.toHaveBeenCalled();
  });

  it("rejects invalid setup defaults before generating secrets or migrating", async () => {
    readSetupDefaults.mockImplementation(() => {
      throw new Error("Invalid DEFAULT_CURRENCY.");
    });

    await expect(register()).rejects.toThrow("Invalid DEFAULT_CURRENCY.");

    expect(ensureRuntimeSecrets).not.toHaveBeenCalled();
    expect(migrateDatabase).not.toHaveBeenCalled();
  });

  it("preserves the normal startup summary without debug diagnostics", async () => {
    await register();

    expect(console.info).toHaveBeenCalledExactlyOnceWith(
      "Folio database ready (sqlite).",
    );
    expect(firstRunSetupMessage).toHaveBeenCalledWith({
      hasOwner: true,
      setupToken: "private-setup-token",
    });
    expect(startRecurringScheduler).toHaveBeenCalledOnce();
  });

  it.each([
    { provided: "private-app-secret", created: false, source: "provided" },
    { provided: undefined, created: false, source: "persisted" },
    { provided: undefined, created: true, source: "generated" },
  ])("reports $source app secrets without revealing their values", async ({
    provided,
    created,
    source,
  }) => {
    vi.stubEnv("DEBUG", "true");
    vi.stubEnv("APP_SECRET", provided);
    ensureRuntimeSecrets.mockResolvedValue({
      authenticationSecretCreated: created,
      configDirectory: "/data",
      setupToken: "private-setup-token",
    });

    await register();

    expect(console.info).toHaveBeenCalledWith(
      "[Folio debug] startup.secrets.ready",
      { appSecretSource: source },
    );
    expect(console.info).toHaveBeenCalledWith(
      "[Folio debug] startup.ready",
      { hasOwner: true, durationMs: expect.any(Number) },
    );
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      "private-",
    );
  });
});
