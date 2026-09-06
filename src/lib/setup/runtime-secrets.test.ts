import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureRuntimeSecrets,
  MINIMUM_SETUP_TOKEN_LENGTH,
  requireSetupToken,
} from "@/lib/setup/runtime-secrets";

const configuredSetupToken = "configured-setup-token-at-least-32-characters";

const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })));
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "folio-secrets-"));
  directories.push(directory);
  return directory;
}

describe("ensureRuntimeSecrets", () => {
  it("creates stable authentication and setup secrets", async () => {
    const directory = await temporaryDirectory();
    const firstEnvironment: Record<string, string | undefined> = {
      FOLIO_DATA_DIR: directory,
    };

    const first = await ensureRuntimeSecrets(firstEnvironment);
    const secondEnvironment: Record<string, string | undefined> = {
      FOLIO_DATA_DIR: directory,
    };
    const second = await ensureRuntimeSecrets(secondEnvironment);

    expect(first.authenticationSecretCreated).toBe(true);
    expect(second.authenticationSecretCreated).toBe(false);
    expect(secondEnvironment.APP_SECRET).toBe(firstEnvironment.APP_SECRET);
    expect(secondEnvironment.SETUP_TOKEN).toBe(firstEnvironment.SETUP_TOKEN);
    expect(firstEnvironment.APP_SECRET).toHaveLength(64);
    expect(firstEnvironment.SETUP_TOKEN).toHaveLength(64);
    expect(first.setupToken).toBe(firstEnvironment.SETUP_TOKEN);
    expect((await readFile(join(directory, "app-secret"), "utf8")).trim()).toBe(
      firstEnvironment.APP_SECRET,
    );
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(directory, "app-secret"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, "setup-token"))).mode & 0o777).toBe(0o600);
    expect(firstEnvironment.BETTER_AUTH_SECRET).toBeUndefined();
  });

  it("preserves explicitly configured secrets", async () => {
    const directory = await temporaryDirectory();
    const environment: Record<string, string | undefined> = {
      APP_SECRET: "configured-app-secret",
      BETTER_AUTH_SECRET: "legacy-auth-secret",
      FOLIO_DATA_DIR: directory,
      SETUP_TOKEN: configuredSetupToken,
    };

    const result = await ensureRuntimeSecrets(environment);

    expect(result.authenticationSecretCreated).toBe(false);
    expect(environment.APP_SECRET).toBe("configured-app-secret");
    expect(environment.BETTER_AUTH_SECRET).toBe("legacy-auth-secret");
    expect(environment.SETUP_TOKEN).toBe(configuredSetupToken);
    expect(await readdir(directory)).toEqual([]);
  });

  it("creates a private directory without changing an existing mount's permissions", async () => {
    const existingDirectory = await temporaryDirectory();
    const newDirectory = join(existingDirectory, "fresh-data");
    await chmod(existingDirectory, 0o770);

    await ensureRuntimeSecrets({ FOLIO_DATA_DIR: existingDirectory });
    await ensureRuntimeSecrets({ FOLIO_DATA_DIR: newDirectory });

    expect((await stat(existingDirectory)).mode & 0o777).toBe(0o770);
    expect((await stat(newDirectory)).mode & 0o777).toBe(0o700);
    for (const directory of [existingDirectory, newDirectory]) {
      expect((await stat(join(directory, "app-secret"))).mode & 0o777).toBe(0o600);
      expect((await stat(join(directory, "setup-token"))).mode & 0o777).toBe(0o600);
    }
  });

  it("accepts the previous authentication environment variable during upgrades", async () => {
    const directory = await temporaryDirectory();
    const environment: Record<string, string | undefined> = {
      BETTER_AUTH_SECRET: "configured-legacy-auth-secret",
      FOLIO_DATA_DIR: directory,
      SETUP_TOKEN: configuredSetupToken,
    };

    const result = await ensureRuntimeSecrets(environment);

    expect(environment.APP_SECRET).toBe("configured-legacy-auth-secret");
    expect(result.authenticationSecretCreated).toBe(false);
    expect(await readdir(directory)).toEqual([]);
  });

  it("preserves legacy files when upgrading a Docker data volume", async () => {
    const directory = await temporaryDirectory();
    const legacyDirectory = join(directory, ".folio");
    await mkdir(legacyDirectory);
    await writeFile(join(legacyDirectory, "auth-secret"), "legacy-auth-secret\n");
    await writeFile(join(legacyDirectory, "setup-token"), `${configuredSetupToken}\n`);
    await writeFile(join(directory, "folio.sqlite"), "existing database");
    const environment: Record<string, string | undefined> = {
      FOLIO_DATA_DIR: directory,
    };

    const result = await ensureRuntimeSecrets(environment);

    expect(result.authenticationSecretCreated).toBe(false);
    expect(environment.APP_SECRET).toBe("legacy-auth-secret");
    expect(environment.SETUP_TOKEN).toBe(configuredSetupToken);
    expect(await readFile(join(directory, "app-secret"), "utf8")).toBe("legacy-auth-secret\n");
    expect(await readFile(join(directory, "setup-token"), "utf8")).toBe(`${configuredSetupToken}\n`);
    expect(await readFile(join(legacyDirectory, "auth-secret"), "utf8")).toBe("legacy-auth-secret\n");
    expect(await readFile(join(directory, "folio.sqlite"), "utf8")).toBe("existing database");
  });

  it("upgrades the old default source directory without configuration", async () => {
    const directory = await temporaryDirectory();
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    const legacyDirectory = join(directory, "data", ".folio");
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(join(legacyDirectory, "auth-secret"), "source-auth-secret\n");
    await writeFile(join(legacyDirectory, "setup-token"), `${configuredSetupToken}\n`);
    const environment: Record<string, string | undefined> = {};

    const result = await ensureRuntimeSecrets(environment);

    expect(result.configDirectory).toBe(join(directory, "data"));
    expect(environment.APP_SECRET).toBe("source-auth-secret");
    expect(environment.SETUP_TOKEN).toBe(configuredSetupToken);
    expect(result.authenticationSecretCreated).toBe(false);
  });

  it("reuses read-only legacy config files without copying when no data directory is set", async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, "auth-secret"), "relocated-legacy-auth-secret\n");
    await writeFile(join(directory, "setup-token"), `${configuredSetupToken}\n`);
    await chmod(directory, 0o500);
    const environment: Record<string, string | undefined> = {
      FOLIO_CONFIG_DIR: directory,
    };

    try {
      const result = await ensureRuntimeSecrets(environment);

      expect(result.configDirectory).toBe(directory);
      expect(environment.APP_SECRET).toBe("relocated-legacy-auth-secret");
      expect(environment.SETUP_TOKEN).toBe(configuredSetupToken);
      expect(result.authenticationSecretCreated).toBe(false);
      expect(await readdir(directory)).toEqual(["auth-secret", "setup-token"]);
      expect((await stat(directory)).mode & 0o777).toBe(0o500);
      expect(await readFile(join(directory, "auth-secret"), "utf8")).toBe("relocated-legacy-auth-secret\n");
      expect(await readFile(join(directory, "setup-token"), "utf8")).toBe(`${configuredSetupToken}\n`);
    } finally {
      await chmod(directory, 0o700);
    }
  });

  it("gives new data-directory files precedence over legacy files", async () => {
    const directory = await temporaryDirectory();
    const explicitLegacyDirectory = await temporaryDirectory();
    await writeFile(join(explicitLegacyDirectory, "auth-secret"), "custom-legacy-secret\n");
    await writeFile(join(explicitLegacyDirectory, "setup-token"), "custom-setup-token-at-least-32-characters\n");
    await mkdir(join(directory, ".folio"));
    await writeFile(join(directory, ".folio", "auth-secret"), "old-auth-secret\n");
    await writeFile(join(directory, ".folio", "setup-token"), "legacy-setup-token-at-least-32-characters\n");
    await writeFile(join(directory, "app-secret"), "current-app-secret\n");
    await writeFile(join(directory, "setup-token"), `${configuredSetupToken}\n`);
    await chmod(join(directory, "app-secret"), 0o640);
    await chmod(join(directory, "setup-token"), 0o640);
    const environment: Record<string, string | undefined> = {
      FOLIO_DATA_DIR: directory,
      FOLIO_CONFIG_DIR: explicitLegacyDirectory,
    };

    await ensureRuntimeSecrets(environment);

    expect(environment.APP_SECRET).toBe("current-app-secret");
    expect(environment.SETUP_TOKEN).toBe(configuredSetupToken);
    expect((await stat(join(directory, "app-secret"))).mode & 0o777).toBe(0o640);
    expect((await stat(join(directory, "setup-token"))).mode & 0o777).toBe(0o640);
  });

  it("migrates an explicitly configured legacy directory when a new data directory is supplied", async () => {
    const directory = await temporaryDirectory();
    const legacyDirectory = await temporaryDirectory();
    await writeFile(join(legacyDirectory, "auth-secret"), "custom-legacy-secret\n");
    await writeFile(join(legacyDirectory, "setup-token"), `${configuredSetupToken}\n`);
    await chmod(join(legacyDirectory, "auth-secret"), 0o640);
    await chmod(join(legacyDirectory, "setup-token"), 0o640);
    await mkdir(join(directory, ".folio"));
    await writeFile(join(directory, ".folio", "auth-secret"), "stale-default-secret\n");
    await writeFile(join(directory, ".folio", "setup-token"), "stale-setup-token-at-least-32-characters\n");
    const environment: Record<string, string | undefined> = {
      FOLIO_DATA_DIR: directory,
      FOLIO_CONFIG_DIR: legacyDirectory,
    };

    const result = await ensureRuntimeSecrets(environment);

    expect(result.configDirectory).toBe(directory);
    expect(result.authenticationSecretCreated).toBe(false);
    expect(environment.APP_SECRET).toBe("custom-legacy-secret");
    expect(environment.SETUP_TOKEN).toBe(configuredSetupToken);
    expect(await readFile(join(directory, "app-secret"), "utf8")).toBe("custom-legacy-secret\n");
    expect(await readFile(join(directory, "setup-token"), "utf8")).toBe(`${configuredSetupToken}\n`);
    expect(await readFile(join(legacyDirectory, "auth-secret"), "utf8")).toBe("custom-legacy-secret\n");
    expect((await stat(join(legacyDirectory, "auth-secret"))).mode & 0o777).toBe(0o640);
    expect((await stat(join(legacyDirectory, "setup-token"))).mode & 0o777).toBe(0o640);
    expect((await stat(join(directory, "app-secret"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, "setup-token"))).mode & 0o777).toBe(0o600);
  });

  it("preserves a secret generated using the legacy config-directory alias", async () => {
    const directory = await temporaryDirectory();
    const legacyEnvironment: Record<string, string | undefined> = {
      FOLIO_CONFIG_DIR: join(directory, ".folio"),
    };
    await ensureRuntimeSecrets(legacyEnvironment);
    const environment: Record<string, string | undefined> = {
      FOLIO_DATA_DIR: directory,
    };

    const result = await ensureRuntimeSecrets(environment);

    expect(result.authenticationSecretCreated).toBe(false);
    expect(environment.APP_SECRET).toBe(legacyEnvironment.APP_SECRET);
    expect(environment.SETUP_TOKEN).toBe(legacyEnvironment.SETUP_TOKEN);
  });

  it("does not import unrelated secrets into an explicitly chosen data directory", async () => {
    const workingDirectory = await temporaryDirectory();
    const directory = await temporaryDirectory();
    const unrelatedDirectory = join(workingDirectory, "data", ".folio");
    vi.spyOn(process, "cwd").mockReturnValue(workingDirectory);
    await mkdir(unrelatedDirectory, { recursive: true });
    await writeFile(join(unrelatedDirectory, "auth-secret"), "unrelated-secret\n");
    const environment: Record<string, string | undefined> = {
      FOLIO_DATA_DIR: directory,
    };

    const result = await ensureRuntimeSecrets(environment);

    expect(result.configDirectory).toBe(directory);
    expect(result.authenticationSecretCreated).toBe(true);
    expect(environment.APP_SECRET).not.toBe("unrelated-secret");
  });

  it("shares complete secrets between simultaneous fresh starts", async () => {
    const directory = await temporaryDirectory();
    const environments: Record<string, string | undefined>[] = Array.from(
      { length: 20 },
      () => ({ FOLIO_DATA_DIR: directory }),
    );

    const results = await Promise.all(environments.map(ensureRuntimeSecrets));

    expect(results.filter((result) => result.authenticationSecretCreated)).toHaveLength(1);
    expect(new Set(environments.map((environment) => environment.APP_SECRET)).size).toBe(1);
    expect(new Set(environments.map((environment) => environment.SETUP_TOKEN)).size).toBe(1);
    expect(await readdir(directory)).toEqual(["app-secret", "setup-token"]);
  });

  it("shares existing secrets between simultaneous upgrade starts", async () => {
    const directory = await temporaryDirectory();
    await mkdir(join(directory, ".folio"));
    await writeFile(join(directory, ".folio", "auth-secret"), "legacy-auth-secret\n");
    await writeFile(join(directory, ".folio", "setup-token"), `${configuredSetupToken}\n`);
    const environments: Record<string, string | undefined>[] = Array.from(
      { length: 20 },
      () => ({ FOLIO_DATA_DIR: directory }),
    );

    const results = await Promise.all(environments.map(ensureRuntimeSecrets));

    expect(results.every((result) => !result.authenticationSecretCreated)).toBe(true);
    expect(environments.every((environment) => environment.APP_SECRET === "legacy-auth-secret")).toBe(true);
    expect(environments.every((environment) => environment.SETUP_TOKEN === configuredSetupToken)).toBe(true);
    expect(await readdir(directory)).toEqual([".folio", "app-secret", "setup-token"]);
  });

  it("normalises explicitly configured setup tokens once at boot", async () => {
    const directory = await temporaryDirectory();
    const environment: Record<string, string | undefined> = {
      FOLIO_DATA_DIR: directory,
      SETUP_TOKEN: `  ${configuredSetupToken}  `,
    };

    const result = await ensureRuntimeSecrets(environment);

    expect(result.setupToken).toBe(configuredSetupToken);
    expect(environment.SETUP_TOKEN).toBe(configuredSetupToken);
    expect(requireSetupToken(environment)).toBe(configuredSetupToken);
  });

  it("rejects weak configured and persisted setup tokens", async () => {
    const configuredDirectory = await temporaryDirectory();
    await expect(
      ensureRuntimeSecrets({
        FOLIO_DATA_DIR: configuredDirectory,
        SETUP_TOKEN: "too-short",
      }),
    ).rejects.toThrow(
      `SETUP_TOKEN must contain at least ${MINIMUM_SETUP_TOKEN_LENGTH} characters.`,
    );

    const persistedDirectory = await temporaryDirectory();
    await writeFile(join(persistedDirectory, "setup-token"), "also-too-short\n");
    await expect(
      ensureRuntimeSecrets({ FOLIO_DATA_DIR: persistedDirectory }),
    ).rejects.toThrow(
      `SETUP_TOKEN must contain at least ${MINIMUM_SETUP_TOKEN_LENGTH} characters.`,
    );
  });

  it("rejects access before boot establishes a setup token", () => {
    expect(() => requireSetupToken({})).toThrow(
      "Folio boot did not initialise the setup token.",
    );
  });
});
