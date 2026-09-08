import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

const authenticationSecret = "a".repeat(64);
const expectedTables = [
  "auth_account",
  "auth_rate_limit",
  "auth_session",
  "auth_user",
  "auth_verification",
  "businesses",
  "customers",
  "expenses",
  "invoice_lines",
  "invoice_revisions",
  "invoices",
  "items",
  "owner_setup_claims",
  "payments",
  "recurring_invoice_lines",
  "recurring_invoices",
  "recurring_runs",
];

type DatabaseModule = typeof import("./index");

function configureDatabase(dialect: "sqlite" | "postgres", url: string): void {
  vi.stubEnv("APP_SECRET", authenticationSecret);
  vi.stubEnv("DATABASE_DIALECT", dialect);
  vi.stubEnv("DATABASE_URL", url);
}

async function expectCurrentSchema(database: DatabaseModule): Promise<void> {
  const tables = await database.db.introspection.getTables();
  const tableNames = tables.map((table) => table.name);
  expect(tableNames).toEqual(expect.arrayContaining(expectedTables));

  const expenses = tables.find((table) => table.name === "expenses");
  expect(expenses?.columns.map((column) => column.name)).toEqual(
    expect.arrayContaining(["receipt_data_url"]),
  );

  const invoices = tables.find((table) => table.name === "invoices");
  expect(invoices?.columns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      "base_currency",
      "exchange_rate_date",
      "exchange_rate_micros",
      "exchange_rate_source",
      "seller_country_code",
      "customer_country_code",
    ]),
  );
}

async function migrateTwice(): Promise<DatabaseModule> {
  vi.resetModules();
  const database = await import("./index");
  await database.migrateDatabase();
  await expectCurrentSchema(database);
  await database.migrateDatabase();
  await expectCurrentSchema(database);
  return database;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("database migration contract", () => {
  it("creates the current SQLite schema and can be run repeatedly", async () => {
    const directory = await mkdtemp(join(tmpdir(), "folio-migrations-"));
    const dataDirectory = join(directory, "data");
    const databaseUrl = join(dataDirectory, "folio.sqlite");
    let database: DatabaseModule | undefined;

    try {
      configureDatabase("sqlite", databaseUrl);
      database = await migrateTwice();
      if (process.platform !== "win32") {
        expect((await stat(dataDirectory)).mode & 0o777).toBe(0o700);
        expect((await stat(databaseUrl)).mode & 0o777).toBe(0o600);
        expect((await stat(`${databaseUrl}-wal`)).mode & 0o777).toBe(0o600);
        expect((await stat(`${databaseUrl}-shm`)).mode & 0o777).toBe(0o600);
      }
    } finally {
      await database?.closeDatabase();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it.runIf(process.platform !== "win32")(
    "repairs a permissive existing SQLite database before use",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "folio-permissions-"));
      const databaseUrl = join(directory, "folio.sqlite");
      let database: DatabaseModule | undefined;

      try {
        await writeFile(databaseUrl, "");
        await chmod(databaseUrl, 0o644);
        configureDatabase("sqlite", databaseUrl);
        vi.resetModules();
        database = await import("./index");
        expect((await stat(databaseUrl)).mode & 0o777).toBe(0o600);
      } finally {
        await database?.closeDatabase();
        await rm(directory, { force: true, recursive: true });
      }
    },
  );

  const postgresContract = process.env.TEST_POSTGRES_DATABASE_URL ? it : it.skip;
  postgresContract(
    "creates the current PostgreSQL schema and can be run repeatedly",
    async () => {
      const baseUrl = process.env.TEST_POSTGRES_DATABASE_URL;
      if (!baseUrl) throw new Error("TEST_POSTGRES_DATABASE_URL is required.");

      const schema = `folio_contract_${randomUUID().replaceAll("-", "")}`;
      const admin = new Pool({ connectionString: baseUrl });
      let database: DatabaseModule | undefined;

      try {
        await admin.query(`create schema ${schema}`);
        const testUrl = new URL(baseUrl);
        testUrl.searchParams.set("options", `-c search_path=${schema}`);
        configureDatabase("postgres", testUrl.toString());
        const migratedDatabase = await migrateTwice();
        database = migratedDatabase;

      } finally {
        try {
          await database?.closeDatabase();
        } finally {
          try {
            await admin.query(`drop schema if exists ${schema} cascade`);
          } finally {
            await admin.end();
          }
        }
      }
    },
    15_000,
  );
});
