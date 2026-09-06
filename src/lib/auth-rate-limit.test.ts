import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquireEmailSignInWork,
  emailSignInBackoffKey,
  EMAIL_SIGN_IN_BACKOFF,
  EMAIL_SIGN_IN_CAPACITY,
  readEmailSignInIdentity,
  reserveEmailSignInAttempt,
  resetEmailSignInCapacityForTests,
  tryAdmitEmailSignIn,
} from "./auth-rate-limit";
import type { Database } from "./db/types";

const secret = "s".repeat(64);
let database: Kysely<Database>;

function jsonSignInRequest(
  email: string,
  contentType = "application/json",
): Request {
  return new Request("http://localhost/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify({ email, password: "password" }),
  });
}

beforeEach(async () => {
  database = new Kysely<Database>({
    dialect: new SqliteDialect({ database: new BetterSqlite3(":memory:") }),
  });
  await database.schema
    .createTable("auth_rate_limit")
    .addColumn("id", "text", (column) => column.primaryKey())
    .addColumn("key", "text", (column) => column.notNull().unique())
    .addColumn("count", "integer", (column) => column.notNull())
    .addColumn("last_request", "integer", (column) => column.notNull())
    .execute();
});

afterEach(async () => {
  resetEmailSignInCapacityForTests();
  vi.useRealTimers();
  await database.destroy();
});

describe("email sign-in guard", () => {
  it("normalises every accepted sign-in representation to one identity", async () => {
    expect(
      await readEmailSignInIdentity(jsonSignInRequest("  OWNER@Example.com ")),
    ).toBe("owner@example.com");
    expect(
      await readEmailSignInIdentity(
        jsonSignInRequest("OWNER@example.com", "application/jsonx"),
      ),
    ).toBe("owner@example.com");

    const form = new URLSearchParams();
    form.append("email", "ignored@example.com");
    form.append("email", " OWNER@EXAMPLE.COM ");
    expect(
      await readEmailSignInIdentity(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          body: form,
        }),
      ),
    ).toBe("owner@example.com");
  });

  it("applies atomic progressive backoff without retaining account denial", async () => {
    const delays = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      delays.push(
        await reserveEmailSignInAttempt(
          database,
          "owner@example.com",
          secret,
          1_000,
        ),
      );
    }
    expect(delays).toEqual([0, 0, 0, 250, 500]);

    const concurrent = await Promise.all(
      Array.from({ length: 20 }, () =>
        reserveEmailSignInAttempt(
          database,
          "owner@example.com",
          secret,
          1_000,
        ),
      ),
    );
    expect(concurrent.every((delay) => delay <= 2_000)).toBe(true);
    expect(concurrent).toContain(EMAIL_SIGN_IN_BACKOFF.maximumMilliseconds);

    expect(
      await reserveEmailSignInAttempt(
        database,
        "owner@example.com",
        secret,
        11_001,
      ),
    ).toBe(0);
  });

  it("uses a secret HMAC rather than retaining the account email", () => {
    const key = emailSignInBackoffKey("owner@example.com", secret);
    expect(key).not.toContain("owner@example.com");
    expect(key).toBe(emailSignInBackoffKey("owner@example.com", secret));
    expect(key).not.toBe(
      emailSignInBackoffKey("owner@example.com", "t".repeat(64)),
    );
  });

  it("bounds admitted requests before any backoff timers or hashing", () => {
    const releases = Array.from(
      { length: EMAIL_SIGN_IN_CAPACITY.admitted },
      () => tryAdmitEmailSignIn(),
    );
    expect(releases.every((release) => typeof release === "function")).toBe(
      true,
    );
    expect(tryAdmitEmailSignIn()).toBeNull();

    for (const release of releases) release?.();
    const next = tryAdmitEmailSignIn();
    expect(next).toBeTypeOf("function");
    next?.();
  });

  it("bounds concurrent password work and expires queued work", async () => {
    vi.useFakeTimers();
    const active = await Promise.all(
      Array.from({ length: EMAIL_SIGN_IN_CAPACITY.concurrent }, () =>
        acquireEmailSignInWork(),
      ),
    );
    const waiting = acquireEmailSignInWork();

    await vi.advanceTimersByTimeAsync(
      EMAIL_SIGN_IN_CAPACITY.workWaitMilliseconds,
    );
    expect(await waiting).toBeNull();

    for (const release of active) release?.();
  });
});
