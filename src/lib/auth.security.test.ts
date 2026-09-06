import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const authenticationSecret = "a".repeat(64);
const origin = "http://127.0.0.1:3000";

function sessionCookie(headers: Headers): string {
  const getSetCookie = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  const values = getSetCookie
    ? getSetCookie.call(headers)
    : [headers.get("set-cookie")].filter(
        (value): value is string => value !== null,
      );
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("authentication security boundaries", () => {
  it("signs in through a standard HTTPS proxy without a configured public URL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "folio-auth-proxy-"));
    const databaseUrl = join(directory, "folio.sqlite");
    let database: typeof import("./db") | undefined;
    const publicOrigin = "https://folio.example.com";

    try {
      vi.stubEnv("APP_SECRET", authenticationSecret);
      vi.stubEnv("DATABASE_DIALECT", "sqlite");
      vi.stubEnv("DATABASE_URL", databaseUrl);

      database = await import("./db");
      await database.migrateDatabase();
      const { getAuth } = await import("./auth");
      const auth = getAuth(new Request(publicOrigin));
      const route = await import("@/app/api/auth/[...all]/route");

      await auth.api.signUpEmail({
        body: {
          email: "owner@example.com",
          name: "Owner",
          password: "correct horse battery staple",
        },
        headers: new Headers({ host: "folio.example.com", origin: publicOrigin }),
      });

      const signIn = (requestOrigin: string) =>
        route.POST(
          new Request("http://0.0.0.0:3000/api/auth/sign-in/email", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie: "folio.session=untrusted-test-cookie",
              host: "folio.example.com",
              origin: requestOrigin,
              "x-forwarded-proto": "https",
            },
            body: JSON.stringify({
              email: "owner@example.com",
              password: "correct horse battery staple",
            }),
          }),
        );

      const response = await signIn(publicOrigin);
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain("session_token");
    } finally {
      await database?.closeDatabase();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("blocks external email changes while preserving the verified server flow", async () => {
    const directory = await mkdtemp(join(tmpdir(), "folio-auth-security-"));
    const databaseUrl = join(directory, "folio.sqlite");
    let database: typeof import("./db") | undefined;

    try {
      vi.stubEnv("APP_SECRET", authenticationSecret);
      vi.stubEnv("DATABASE_DIALECT", "sqlite");
      vi.stubEnv("DATABASE_URL", databaseUrl);

      database = await import("./db");
      await database.migrateDatabase();
      const { getAuth } = await import("./auth");
      const auth = getAuth(new Request(origin));

      const signup = await auth.api.signUpEmail({
        body: {
          email: "owner@example.com",
          name: "Owner",
          password: "correct horse battery staple",
        },
        headers: new Headers({ origin }),
        returnHeaders: true,
      });
      const cookie = sessionCookie(signup.headers);
      expect(cookie).not.toBe("");

      for (const path of [
        "/api/auth/change-email",
        "/api/auth/change-email/",
        "/api/auth/%63hange-email",
        "/api/auth/change%2Demail",
      ]) {
        const response = await auth.handler(
          new Request(`${origin}${path}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie,
              origin,
            },
            body: JSON.stringify({ newEmail: "attacker@example.com" }),
          }),
        );
        expect(response.status).toBe(404);
      }

      expect(
        await database.db
          .selectFrom("auth_user")
          .select("email")
          .executeTakeFirstOrThrow(),
      ).toEqual({ email: "owner@example.com" });

      const sessionHeaders = new Headers({ cookie, origin });
      await auth.api.verifyPassword({
        body: { password: "correct horse battery staple" },
        headers: sessionHeaders,
      });
      await auth.api.changeEmail({
        body: { newEmail: "new-owner@example.com" },
        headers: sessionHeaders,
      });

      expect(
        await database.db
          .selectFrom("auth_user")
          .select("email")
          .executeTakeFirstOrThrow(),
      ).toEqual({ email: "new-owner@example.com" });

      const signIn = await auth.handler(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({
            email: "new-owner@example.com",
            password: "correct horse battery staple",
          }),
        }),
      );
      expect(signIn.status).toBe(200);
    } finally {
      await database?.closeDatabase();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("does not retain an attacker-controlled denial against the owner account", async () => {
    const directory = await mkdtemp(join(tmpdir(), "folio-auth-limit-"));
    const databaseUrl = join(directory, "folio.sqlite");
    let database: typeof import("./db") | undefined;

    try {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("APP_SECRET", authenticationSecret);
      vi.stubEnv("DATABASE_DIALECT", "sqlite");
      vi.stubEnv("DATABASE_URL", databaseUrl);

      database = await import("./db");
      await database.migrateDatabase();
      const { getAuth, useEmailSignInCapacityGuard } = await import("./auth");
      const auth = getAuth(new Request(origin));
      const route = await import("@/app/api/auth/[...all]/route");

      expect(useEmailSignInCapacityGuard).toBe(true);
      await auth.api.signUpEmail({
        body: {
          email: "owner@example.com",
          name: "Owner",
          password: "correct horse battery staple",
        },
        headers: new Headers({ origin }),
      });

      const signIn = (
        email: string,
        password: string,
        contentType = "application/json",
      ) =>
        route.POST(
          new Request(`${origin}/api/auth/sign-in/email`, {
            method: "POST",
            headers: { "content-type": contentType, origin },
            body: JSON.stringify({ email, password }),
          }),
        );

      expect(
        (await signIn("owner@example.com", "correct horse battery staple"))
          .status,
      ).toBe(200);
      expect((await signIn("owner@example.com", "wrong password")).status).toBe(
        401,
      );
      expect((await signIn("OWNER@example.com", "wrong password")).status).toBe(
        401,
      );

      expect(
        (await signIn("owner@example.com", "wrong password", "application/jsonx"))
          .status,
      ).toBe(401);
      expect((await signIn("other@example.com", "wrong password")).status).toBe(
        401,
      );
      expect(
        (await signIn("owner@example.com", "correct horse battery staple"))
          .status,
      ).toBe(200);
    } finally {
      await database?.closeDatabase();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects oversized non-sign-in auth bodies before Better Auth parses them", async () => {
    vi.stubEnv("APP_SECRET", authenticationSecret);
    vi.stubEnv("DATABASE_DIALECT", "sqlite");
    vi.stubEnv("DATABASE_URL", ":memory:");

    const route = await import("@/app/api/auth/[...all]/route");
    const response = await route.POST(
      new Request(`${origin}/api/auth/forget-password`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: "x".repeat(16 * 1024 + 1),
      }),
    );

    expect(response.status).toBe(413);
  });
});
