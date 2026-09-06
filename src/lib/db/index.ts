import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import BetterSqlite3 from "better-sqlite3";
import {
  Kysely,
  PostgresDialect,
  SqliteDialect,
  type Transaction,
} from "kysely";
import { Pool, types as postgresTypes } from "pg";

import { readDatabaseConfig } from "@/lib/runtime-config";
import { readSqliteFilename } from "@/lib/runtime-paths";

import type { Database } from "./types";

export type DatabaseDialect = "sqlite" | "postgres";
export type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

interface DatabaseState {
  db: Kysely<Database>;
  dialect: DatabaseDialect;
}

function parsePostgresSafeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`PostgreSQL returned an unsafe integer: ${value}`);
  }
  return parsed;
}

const globalDatabase = globalThis as typeof globalThis & {
  __folioDatabase?: DatabaseState;
};

function createDatabase(): DatabaseState {
  const config = readDatabaseConfig();
  const { dialect } = config;

  if (dialect === "postgres") {
    postgresTypes.setTypeParser(
      postgresTypes.builtins.INT8,
      parsePostgresSafeInteger,
    );
    return {
      dialect,
      db: new Kysely<Database>({
        dialect: new PostgresDialect({
          // With no URL, node-postgres reads the standard PGHOST, PGPORT,
          // PGUSER, PGPASSWORD and PGDATABASE variables. This also avoids
          // interpolating unescaped passwords into connection URLs in Compose.
          pool: new Pool({
            ...(config.url ? { connectionString: config.url } : {}),
            max: config.poolSize,
          }),
        }),
      }),
    };
  }

  const filename = readSqliteFilename(config.url);
  let database: BetterSqlite3.Database;

  if (filename === ":memory:") {
    database = new BetterSqlite3(filename);
  } else {
    const previousUmask = process.umask(0o077);
    try {
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
      database = new BetterSqlite3(filename);
      chmodSync(filename, 0o600);
      database.pragma("journal_mode = WAL");
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        const companion = `${filename}${suffix}`;
        if (existsSync(companion)) chmodSync(companion, 0o600);
      }
    } finally {
      process.umask(previousUmask);
    }
  }

  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");

  return {
    dialect,
    db: new Kysely<Database>({
      dialect: new SqliteDialect({ database }),
    }),
  };
}

const state = globalDatabase.__folioDatabase ?? createDatabase();
globalDatabase.__folioDatabase = state;

export const db = state.db;

export function getDatabaseDialect(): DatabaseDialect {
  return state.dialect;
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function todayIso(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function closeDatabase(): Promise<void> {
  await state.db.destroy();
  if (globalDatabase.__folioDatabase === state) {
    delete globalDatabase.__folioDatabase;
  }
}

export async function migrateDatabase(): Promise<void> {
  const { runDatabaseMigrations } = await import("./migrations");
  await runDatabaseMigrations(db);
}

export type * from "./types";
