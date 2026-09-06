import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readDatabaseConfig,
  requestPublicOrigin,
  requestWithPublicOrigin,
  trustedRequestOrigins,
} from "./runtime-config";

afterEach(() => vi.unstubAllEnvs());

describe("runtime configuration", () => {
  it("derives a public HTTPS origin from ordinary proxy headers", () => {
    const request = new Request("http://0.0.0.0:3000/api/auth/sign-in/email", {
      headers: {
        host: "folio.example.com",
        origin: "https://folio.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(requestPublicOrigin(request)).toBe("https://folio.example.com");
    expect(requestWithPublicOrigin(request).url).toBe(
      "https://folio.example.com/api/auth/sign-in/email",
    );
  });

  it("does not let Origin replace the request host", () => {
    const request = new Request("http://0.0.0.0:3000/api/setup/owner", {
      headers: {
        host: "folio.example.com",
        origin: "https://attacker.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(requestPublicOrigin(request)).toBe("https://folio.example.com");
    expect(trustedRequestOrigins(request)).not.toContain(
      "https://attacker.example",
    );
  });

  it("uses HTTP automatically for loopback and private network addresses", () => {
    expect(
      requestPublicOrigin(
        new Request("http://0.0.0.0:3000/setup", {
          headers: { host: "192.168.1.20:3000" },
        }),
      ),
    ).toBe("http://192.168.1.20:3000");
  });

  it.each([
    "eu-uk-01:3456",
    "100.64.0.12:3456",
    "[fd7a:115c:a1e0::12]:3456",
    "folio.example.com:3456",
  ])("uses the transport rather than guessing from host %s", (host) => {
    expect(
      requestPublicOrigin(
        new Request("http://0.0.0.0:3000/setup", { headers: { host } }),
      ),
    ).toBe(`http://${host}`);
    expect(requestPublicOrigin(new Headers({ host }))).toBe(`http://${host}`);
  });

  it("resolves headers-only server calls without Origin or Referer", () => {
    const headers = new Headers({
      host: "folio.example.com",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "attacker.example",
    });
    expect(requestPublicOrigin(headers)).toBe("https://folio.example.com");
  });

  it("does not let a referring HTTP page downgrade an HTTPS destination", () => {
    const headers = new Headers({
      host: "folio.example.com",
      origin: "http://folio.example.com",
      referer: "http://folio.example.com/sign-in",
      "x-forwarded-proto": "https",
    });
    expect(requestPublicOrigin(headers)).toBe("https://folio.example.com");
    expect(
      requestPublicOrigin(new Request("http://0.0.0.0:3000/", { headers })),
    ).toBe("https://folio.example.com");

    headers.delete("x-forwarded-proto");
    expect(
      requestPublicOrigin(new Request("https://folio.example.com/", { headers })),
    ).toBe("https://folio.example.com");
  });

  it("ignores a legacy public URL and trusts only the current request origin", () => {
    vi.stubEnv("FOLIO_PUBLIC_URL", "https://legacy.example.com");
    const request = new Request("http://eu-uk-01:3456/setup");
    expect(requestPublicOrigin(request)).toBe("http://eu-uk-01:3456");
    expect(trustedRequestOrigins(request)).toEqual(["http://eu-uk-01:3456"]);
    expect(trustedRequestOrigins()).toEqual([]);
    expect(requestWithPublicOrigin(request).url).toBe(request.url);
  });

  it.each([
    ["http", "folio.example.com:80", "http://folio.example.com"],
    ["https", "folio.example.com:80", "https://folio.example.com:80"],
    ["https", "folio.example.com:443", "https://folio.example.com"],
  ])("normalises ports using the %s transport", (protocol, host, origin) => {
    expect(
      requestPublicOrigin(new Headers({ host, "x-forwarded-proto": protocol })),
    ).toBe(origin);
  });

  it.each(["bad/host", "user@host", "host?query", "host#fragment", "host,other"])(
    "does not authenticate a malformed Host: %s",
    (host) => {
      expect(requestPublicOrigin(new Headers({ host }))).toBeUndefined();
    },
  );

  it("infers PostgreSQL from its URL", () => {
    expect(
      readDatabaseConfig({ DATABASE_URL: "postgresql://db/folio" }),
    ).toEqual({
      dialect: "postgres",
      poolSize: 10,
      url: "postgresql://db/folio",
    });
  });

  it("supports PostgreSQL connection environment variables without a URL", () => {
    expect(readDatabaseConfig({ DATABASE_DIALECT: "postgres" })).toEqual({
      dialect: "postgres",
      poolSize: 10,
    });
  });

  it("rejects contradictory database settings", () => {
    expect(() =>
      readDatabaseConfig({
        DATABASE_DIALECT: "sqlite",
        DATABASE_URL: "postgres://db/folio",
      }),
    ).toThrow("DATABASE_DIALECT is sqlite");

    expect(() =>
      readDatabaseConfig({
        DATABASE_DIALECT: "postgres",
        DATABASE_URL: "./data/folio.db",
      }),
    ).toThrow("DATABASE_DIALECT is postgres");
  });

  it("rejects invalid pool sizes instead of silently changing them", () => {
    expect(() =>
      readDatabaseConfig({ DATABASE_POOL_SIZE: "12px" }),
    ).toThrow("positive integer");
    expect(() => readDatabaseConfig({ DATABASE_POOL_SIZE: "0" })).toThrow(
      "positive integer",
    );
  });
});
