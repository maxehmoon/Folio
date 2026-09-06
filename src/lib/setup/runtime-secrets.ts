import { randomBytes, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readDataDirectory } from "@/lib/runtime-paths";

type RuntimeEnvironment = Record<string, string | undefined>;

export type RuntimeSecretsResult = {
  authenticationSecretCreated: boolean;
  configDirectory: string;
  setupToken: string;
};

export const MINIMUM_SETUP_TOKEN_LENGTH = 32;

function configDirectory(environment: RuntimeEnvironment): string {
  const legacy = environment.FOLIO_CONFIG_DIR?.trim();
  // Honour the previous secret-only override until the data directory is set.
  return !environment.FOLIO_DATA_DIR?.trim() && legacy
    ? resolve(/* turbopackIgnore: true */ process.cwd(), legacy)
    : readDataDirectory(environment);
}

function secretValue(): string {
  return randomBytes(32).toString("hex");
}

function validateSetupToken(token: string): string {
  if (token.length < MINIMUM_SETUP_TOKEN_LENGTH) {
    throw new Error(
      `SETUP_TOKEN must contain at least ${MINIMUM_SETUP_TOKEN_LENGTH} characters.`,
    );
  }
  return token;
}

export function requireSetupToken(
  environment: RuntimeEnvironment = process.env,
): string {
  const token = environment.SETUP_TOKEN?.trim();
  if (!token) {
    throw new Error("Folio boot did not initialise the setup token.");
  }
  return validateSetupToken(token);
}

async function readSecret(filename: string): Promise<string | null> {
  try {
    const value = (await readFile(filename, "utf8")).trim();
    if (!value) throw new Error(`Folio found an empty secret file at ${filename}.`);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function persistentSecret(
  directory: string,
  filename: string,
  legacyPaths: string[],
  copyLegacy = true,
): Promise<{
  created: boolean;
  value: string;
}> {
  const path = resolve(directory, filename);
  const existing = await readSecret(path);
  if (existing) return { created: false, value: existing };

  let legacyValue: string | null = null;
  for (const legacyPath of legacyPaths) {
    legacyValue = await readSecret(legacyPath);
    if (legacyValue) break;
  }
  // A legacy-only override may be a read-only secret mount. Reuse its files
  // until the operator selects a unified data directory for migration.
  if (legacyValue && !copyLegacy) return { created: false, value: legacyValue };
  const value = legacyValue ?? secretValue();
  const temporaryPath = resolve(directory, `.${filename}.${randomUUID()}.tmp`);
  await writeFile(temporaryPath, `${value}\n`, { flag: "wx", mode: 0o600 });
  try {
    // Publish only after writing finishes: simultaneous starts never read a
    // partially written secret, and an existing file is never overwritten.
    await link(temporaryPath, path);
    return { created: legacyValue === null, value };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const racedValue = await readSecret(path);
    if (!racedValue) throw new Error(`Folio could not initialise ${path}.`);
    return { created: false, value: racedValue };
  } finally {
    await unlink(temporaryPath);
  }
}

export async function ensureRuntimeSecrets(
  environment: RuntimeEnvironment = process.env,
): Promise<RuntimeSecretsResult> {
  const directory = configDirectory(environment);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const configuredLegacyDirectory = environment.FOLIO_CONFIG_DIR?.trim();
  const legacyDirectory = configuredLegacyDirectory
    ? resolve(/* turbopackIgnore: true */ process.cwd(), configuredLegacyDirectory)
    : undefined;
  const copyLegacy = Boolean(environment.FOLIO_DATA_DIR?.trim()) || !legacyDirectory;

  let authenticationSecretCreated = false;
  let authenticationSecret =
    environment.APP_SECRET?.trim() || environment.BETTER_AUTH_SECRET?.trim();
  if (!authenticationSecret) {
    const secret = await persistentSecret(directory, "app-secret", [
      ...(legacyDirectory ? [
        resolve(legacyDirectory, "app-secret"),
        resolve(legacyDirectory, "auth-secret"),
      ] : []),
      resolve(directory, "auth-secret"),
      resolve(directory, ".folio", "app-secret"),
      resolve(directory, ".folio", "auth-secret"),
    ], copyLegacy);
    authenticationSecret = secret.value;
    authenticationSecretCreated = secret.created;
  }
  environment.APP_SECRET = authenticationSecret;

  let setupToken = environment.SETUP_TOKEN?.trim();
  if (!setupToken) {
    const token = await persistentSecret(directory, "setup-token", [
      ...(legacyDirectory ? [resolve(legacyDirectory, "setup-token")] : []),
      resolve(directory, ".folio", "setup-token"),
    ], copyLegacy);
    setupToken = token.value;
  }
  setupToken = validateSetupToken(setupToken);
  environment.SETUP_TOKEN = setupToken;

  return { authenticationSecretCreated, configDirectory: directory, setupToken };
}
