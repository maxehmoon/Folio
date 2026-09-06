import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readDataDirectory, readSqliteFilename } from "@/lib/runtime-paths";

const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, {
    force: true,
    recursive: true,
  })));
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "folio-paths-"));
  directories.push(directory);
  return directory;
}

describe("runtime data paths", () => {
  it("defaults fresh source installs to a single data directory", async () => {
    const directory = await temporaryDirectory();
    vi.spyOn(process, "cwd").mockReturnValue(directory);

    expect(readDataDirectory({})).toBe(join(directory, "data"));
    expect(readSqliteFilename(undefined, {})).toBe(join(directory, "data", "folio.sqlite"));
    expect(readDataDirectory({ FOLIO_DATA_DIR: " ./custom " })).toBe(join(directory, "custom"));
  });

  it("uses the selected directory for a fresh database", async () => {
    const directory = await temporaryDirectory();

    expect(readSqliteFilename(undefined, { FOLIO_DATA_DIR: directory })).toBe(join(directory, "folio.sqlite"));
  });

  it("reuses a legacy database and leaves WAL files untouched", async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, "folio.db"), "existing database");
    await writeFile(join(directory, "folio.db-wal"), "existing transaction");

    expect(readSqliteFilename(undefined, { FOLIO_DATA_DIR: directory })).toBe(join(directory, "folio.db"));
    expect(await readFile(join(directory, "folio.db-wal"), "utf8")).toBe("existing transaction");
  });

  it("keeps the old source database when only the legacy secret location is configured", async () => {
    const directory = await temporaryDirectory();
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    await mkdir(join(directory, "data"));
    await writeFile(join(directory, "data", "folio.db"), "existing database");

    expect(readSqliteFilename(undefined, { FOLIO_CONFIG_DIR: "./secrets" })).toBe(join(directory, "data", "folio.db"));
  });

  it("prefers the current database when both filenames exist", async () => {
    const directory = await temporaryDirectory();
    await writeFile(join(directory, "folio.db"), "legacy database");
    await writeFile(join(directory, "folio.sqlite"), "current database");

    expect(readSqliteFilename(undefined, { FOLIO_DATA_DIR: directory })).toBe(join(directory, "folio.sqlite"));
  });

  it("does not select unrelated databases outside an explicitly chosen directory", async () => {
    const workingDirectory = await temporaryDirectory();
    const directory = await temporaryDirectory();
    vi.spyOn(process, "cwd").mockReturnValue(workingDirectory);
    await mkdir(join(workingDirectory, "data"));
    await writeFile(join(workingDirectory, "data", "folio.db"), "unrelated database");

    expect(readSqliteFilename(undefined, { FOLIO_DATA_DIR: directory })).toBe(join(directory, "folio.sqlite"));
  });

  it("continues to honour explicit database locations", async () => {
    const directory = await temporaryDirectory();
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    const environment = { FOLIO_DATA_DIR: "/unused" };

    expect(readSqliteFilename(":memory:", environment)).toBe(":memory:");
    expect(readSqliteFilename("./custom.db", environment)).toBe(join(directory, "custom.db"));
    expect(readSqliteFilename("sqlite:/data/custom.db", environment)).toBe("/data/custom.db");
    expect(readSqliteFilename("file:///data/custom%20database.db", environment)).toBe("/data/custom database.db");
  });
});
