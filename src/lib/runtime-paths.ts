import { existsSync } from "node:fs";
import { resolve } from "node:path";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export function readDataDirectory(
  environment: RuntimeEnvironment = process.env,
): string {
  return resolve(
    /* turbopackIgnore: true */ process.cwd(),
    environment.FOLIO_DATA_DIR?.trim() || "./data",
  );
}

export function readSqliteFilename(
  configured?: string,
  environment: RuntimeEnvironment = process.env,
): string {
  if (!configured) {
    const directory = readDataDirectory(environment);
    const current = resolve(directory, "folio.sqlite");
    const legacy = resolve(directory, "folio.db");
    // Keep existing databases in place, including their SQLite WAL files.
    return !existsSync(current) && existsSync(legacy) ? legacy : current;
  }
  if (configured === ":memory:") return configured;

  let filename = configured;
  if (configured.startsWith("sqlite:")) filename = configured.slice("sqlite:".length);
  if (configured.startsWith("file:")) filename = configured.slice("file:".length);
  if (filename.startsWith("//")) filename = filename.slice(2);
  return resolve(
    /* turbopackIgnore: true */ process.cwd(),
    decodeURIComponent(filename),
  );
}
