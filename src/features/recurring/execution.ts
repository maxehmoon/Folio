import "server-only";

import type { Kysely } from "kysely";
import { Client } from "pg";

import {
  runRecurringTicksAtWithDatabase,
  type RecurringBusinessTickResult,
} from "@/features/recurring/service";
import {
  db,
  getDatabaseDialect,
  type Database,
  type DatabaseDialect,
} from "@/lib/db";
import { readDatabaseConfig } from "@/lib/runtime-config";

const POSTGRES_LOCK_ID = 0x466f6c696f;

export type RecurringTickExecution =
  | { status: "completed"; result: RecurringBusinessTickResult }
  | { status: "coalesced" };

type RecurringTickRunner = (
  database: Kysely<Database>,
  now: Date,
) => Promise<RecurringBusinessTickResult>;

const executionGlobal = globalThis as typeof globalThis & {
  __folioRecurringTickRunning?: boolean;
};

async function runWithProcessLock(
  database: Kysely<Database>,
  now: Date,
  run: RecurringTickRunner,
): Promise<RecurringTickExecution> {
  if (executionGlobal.__folioRecurringTickRunning) {
    return { status: "coalesced" };
  }
  executionGlobal.__folioRecurringTickRunning = true;
  try {
    return { status: "completed", result: await run(database, now) };
  } finally {
    delete executionGlobal.__folioRecurringTickRunning;
  }
}

async function runWithPostgresLock(
  database: Kysely<Database>,
  now: Date,
  run: RecurringTickRunner,
): Promise<RecurringTickExecution> {
  const config = readDatabaseConfig();
  const client = new Client(
    config.url ? { connectionString: config.url } : undefined,
  );
  await client.connect();
  try {
    await client.query("begin");
    const lock = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_xact_lock($1::bigint) as acquired",
      [POSTGRES_LOCK_ID],
    );
    if (!lock.rows[0]?.acquired) {
      await client.query("rollback");
      return { status: "coalesced" };
    }

    try {
      const result = await run(database, now);
      await client.query("commit");
      return { status: "completed", result };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    await client.end();
  }
}

export function runRecurringTicksOnceAtWithDatabase(
  database: Kysely<Database>,
  now: Date,
  run: RecurringTickRunner = runRecurringTicksAtWithDatabase,
  dialect: DatabaseDialect = "sqlite",
): Promise<RecurringTickExecution> {
  return dialect === "postgres"
    ? runWithPostgresLock(database, now, run)
    : runWithProcessLock(database, now, run);
}

export function runRecurringTicksOnceAt(
  now = new Date(),
): Promise<RecurringTickExecution> {
  return runRecurringTicksOnceAtWithDatabase(
    db,
    now,
    runRecurringTicksAtWithDatabase,
    getDatabaseDialect(),
  );
}
