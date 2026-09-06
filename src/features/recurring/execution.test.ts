import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/db/types";

import { runRecurringTicksOnceAtWithDatabase } from "./execution";

let database: Kysely<Database>;

const emptyResult = {
  businesses: 0,
  due: 0,
  generated: 0,
  skipped: 0,
  failed: 0,
  capped: 0,
  errors: [],
};

beforeEach(async () => {
  database = new Kysely<Database>({
    dialect: new SqliteDialect({ database: new BetterSqlite3(":memory:") }),
  });
});

afterEach(async () => {
  await database.destroy();
  vi.useRealTimers();
});

describe("recurring tick execution lease", () => {
  it("coalesces concurrent callers and releases the lease after success", async () => {
    let finish: (() => void) | undefined;
    const run = vi.fn(
      () =>
        new Promise<typeof emptyResult>((resolve) => {
          finish = () => resolve(emptyResult);
        }),
    );

    const first = runRecurringTicksOnceAtWithDatabase(database, new Date(), run);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await expect(
      runRecurringTicksOnceAtWithDatabase(database, new Date(), run),
    ).resolves.toEqual({ status: "coalesced" });

    finish?.();
    await expect(first).resolves.toEqual({
      status: "completed",
      result: emptyResult,
    });
  });

  it("releases failed work so a later tick can run", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("tick failed"));
    await expect(
      runRecurringTicksOnceAtWithDatabase(database, new Date(), failing),
    ).rejects.toThrow("tick failed");

    await expect(
      runRecurringTicksOnceAtWithDatabase(
        database,
        new Date(),
        vi.fn().mockResolvedValue(emptyResult),
      ),
    ).resolves.toMatchObject({ status: "completed" });
  });
});
