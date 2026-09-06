import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DatabaseModule = typeof import("@/lib/db");
type AuthModule = typeof import("@/lib/auth");
type AuthRoute = typeof import("@/app/api/auth/[...all]/route");
type OwnerRoute = typeof import("@/app/api/setup/owner/route");

type Deployment = {
  name: string;
  origin: string;
  forwardedProtocol?: string;
};

const owner = {
  name: "Owner",
  email: "owner@example.com",
  password: "correct horse battery staple",
};
const setupToken = "test-only-setup-token-with-at-least-thirty-two-characters";
const deployments: Deployment[] = [
  { name: "HTTP hostname and custom port", origin: "http://eu-uk-01:3456" },
  { name: "HTTP CGNAT address", origin: "http://100.101.102.103:3456" },
  { name: "HTTP IPv6 address", origin: "http://[fd7a:115c:a1e0::1234]:3456" },
  {
    name: "HTTPS reverse proxy",
    origin: "https://folio.example.com",
    forwardedProtocol: "https",
  },
];

let directory: string;
let database: DatabaseModule | undefined;
let auth: AuthModule;
let authRoute: AuthRoute;
let ownerRoute: OwnerRoute;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "folio-auth-transport-"));
  vi.stubEnv("NODE_ENV", "production");
  // Better Auth also uses TEST to bypass its normal origin/CSRF checks.
  vi.stubEnv("TEST", "false");
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv("DATABASE_URL", join(directory, "folio.sqlite"));
  vi.stubEnv("APP_SECRET", "transport-test-only-secret-".repeat(3));
  vi.stubEnv("SETUP_TOKEN", setupToken);
  vi.resetModules();
});

afterEach(async () => {
  await database?.closeDatabase();
  database = undefined;
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function initialise() {
  database = await import("@/lib/db");
  await database.migrateDatabase();
  auth = await import("@/lib/auth");
  authRoute = await import("@/app/api/auth/[...all]/route");
  ownerRoute = await import("@/app/api/setup/owner/route");
  expect(auth.useEmailSignInCapacityGuard).toBe(true);
}

function requestHeaders(deployment: Deployment, cookie?: string) {
  const headers = new Headers({
    host: new URL(deployment.origin).host,
    origin: deployment.origin,
    "sec-fetch-site": "same-origin",
  });
  if (deployment.forwardedProtocol) {
    headers.set("x-forwarded-proto", deployment.forwardedProtocol);
  }
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

function authRequest(
  deployment: Deployment,
  path: string,
  body?: unknown,
  cookie?: string,
) {
  const headers = requestHeaders(deployment, cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://0.0.0.0:3000/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function ownerRequest(deployment: Deployment) {
  const headers = requestHeaders(deployment);
  headers.set("accept", "application/json");
  return new Request("http://0.0.0.0:3000/api/setup/owner", {
    method: "POST",
    headers,
    body: new URLSearchParams({
      ...owner,
      confirmPassword: owner.password,
      setupToken,
    }),
  });
}

function sessionSetCookie(response: Response): string {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => /^[^=]*\.session_token=/.test(value));
  expect(cookie).toBeDefined();
  return cookie!;
}

function acceptedSessionCookie(response: Response, origin: string): string {
  const value = sessionSetCookie(response);
  const secure = new URL(origin).protocol === "https:";
  expect(value).toMatch(/; HttpOnly(?:;|$)/i);
  expect(value).toMatch(/; SameSite=Lax(?:;|$)/i);
  expect(value).toMatch(/; Path=\/(?:;|$)/i);
  expect(/; Secure(?:;|$)/i.test(value)).toBe(secure);
  expect(value.startsWith("__Secure-")).toBe(secure);
  return value.split(";", 1)[0];
}

async function readServerSession(deployment: Deployment, cookie: string) {
  const headers = requestHeaders(deployment, cookie);
  // Top-level navigation can omit both browser origin headers. Server-side
  // session reads must still choose the same cookie as setup and sign-in.
  headers.delete("origin");
  headers.delete("sec-fetch-site");
  return auth.getAuth(headers).api.getSession({ headers });
}

describe("production authentication transport", () => {
  it.each(deployments)(
    "retains setup and sign-in sessions over $name",
    async (deployment) => {
      await initialise();

      const setup = await ownerRoute.POST(ownerRequest(deployment));
      expect(setup.status).toBe(200);
      await expect(setup.json()).resolves.toEqual({
        ok: true,
        redirectTo: "/setup?step=organisation",
      });
      const setupCookie = acceptedSessionCookie(setup, deployment.origin);
      expect((await readServerSession(deployment, setupCookie))?.user.email).toBe(
        owner.email,
      );

      const getSession = await authRoute.GET(
        authRequest(deployment, "get-session", undefined, setupCookie),
      );
      expect(getSession.status).toBe(200);
      expect((await getSession.json()).user.email).toBe(owner.email);

      const signOut = await authRoute.POST(
        authRequest(deployment, "sign-out", {}, setupCookie),
      );
      expect(signOut.status).toBe(200);
      const deletedCookie = acceptedSessionCookie(signOut, deployment.origin);
      expect(deletedCookie.split("=", 1)[0]).toBe(setupCookie.split("=", 1)[0]);
      expect(sessionSetCookie(signOut)).toMatch(/; Max-Age=0(?:;|$)/i);
      expect(await readServerSession(deployment, setupCookie)).toBeNull();

      const signIn = await authRoute.POST(
        authRequest(deployment, "sign-in/email", owner),
      );
      expect(signIn.status).toBe(200);
      const signedInCookie = acceptedSessionCookie(signIn, deployment.origin);
      expect(signedInCookie.split("=", 1)[0]).toBe(setupCookie.split("=", 1)[0]);
      expect(
        (await readServerSession(deployment, signedInCookie))?.user.email,
      ).toBe(owner.email);
    },
  );

  it("keeps HTTP and HTTPS request contexts independent", async () => {
    const http = deployments[0];
    const https: Deployment = {
      name: "HTTPS on the same hostname",
      origin: "https://eu-uk-01:3456",
      forwardedProtocol: "https",
    };
    await initialise();
    const setup = await ownerRoute.POST(ownerRequest(http));
    expect(setup.status).toBe(200);
    const setupCookie = acceptedSessionCookie(setup, http.origin);

    const [httpsLogin, httpLogin] = await Promise.all([
      authRoute.POST(authRequest(https, "sign-in/email", owner)),
      authRoute.POST(authRequest(http, "sign-in/email", owner)),
    ]);
    expect(httpsLogin.status).toBe(200);
    expect(httpLogin.status).toBe(200);
    const secureCookie = acceptedSessionCookie(httpsLogin, https.origin);
    const httpCookie = acceptedSessionCookie(httpLogin, http.origin);

    expect((await readServerSession(http, setupCookie))?.user.email).toBe(owner.email);
    expect((await readServerSession(https, secureCookie))?.user.email).toBe(owner.email);
    expect((await readServerSession(http, httpCookie))?.user.email).toBe(owner.email);
    expect(await readServerSession(https, httpCookie)).toBeNull();
    expect(await readServerSession(http, secureCookie)).toBeNull();
  });

  it.each([deployments[0], deployments[3]])(
    "preserves legacy origin-namespaced sessions over $name",
    async (deployment) => {
      await initialise();
      const { betterAuth } = await import("better-auth");
      const originId = createHash("sha256")
        .update(deployment.origin)
        .digest("hex")
        .slice(0, 10);
      const legacyAuth = betterAuth({
        ...auth.authOptions,
        baseURL: deployment.origin,
        advanced: {
          ...auth.authOptions.advanced,
          cookiePrefix: `folio-${originId}`,
        },
      });
      const signup = await legacyAuth.api.signUpEmail({
        body: owner,
        headers: requestHeaders(deployment),
        returnHeaders: true,
      });
      const legacyCookie = acceptedSessionCookie(
        new Response(null, { headers: signup.headers }),
        deployment.origin,
      );
      expect(legacyCookie).toContain(`folio-${originId}.session_token=`);
      expect((await readServerSession(deployment, legacyCookie))?.user.email).toBe(
        owner.email,
      );
      const secure = new URL(deployment.origin).protocol === "https:";
      const currentCookieName = `${secure ? "__Secure-" : ""}folio.session_token`;
      expect(await readServerSession(
        deployment,
        `${legacyCookie}; ${currentCookieName}=invalid`,
      )).toBeNull();
      const otherProtocol: Deployment = {
        name: "opposite transport",
        origin: deployment.origin.replace(/^https?:/, secure ? "http:" : "https:"),
        forwardedProtocol: secure ? "http" : "https",
      };
      expect(await readServerSession(otherProtocol, legacyCookie)).toBeNull();
      const getSession = await authRoute.GET(
        authRequest(deployment, "get-session", undefined, legacyCookie),
      );
      expect(getSession.status).toBe(200);
      expect((await getSession.json()).user.email).toBe(owner.email);

      const signOut = await authRoute.POST(
        authRequest(deployment, "sign-out", {}, legacyCookie),
      );
      expect(signOut.status).toBe(200);
      const deletedCookie = acceptedSessionCookie(signOut, deployment.origin);
      expect(deletedCookie.split("=", 1)[0]).toBe(legacyCookie.split("=", 1)[0]);
      expect(sessionSetCookie(signOut)).toMatch(/; Max-Age=0(?:;|$)/i);
      expect(await readServerSession(deployment, legacyCookie)).toBeNull();

      const signIn = await authRoute.POST(
        authRequest(deployment, "sign-in/email", owner),
      );
      expect(signIn.status).toBe(200);
      const currentCookie = acceptedSessionCookie(signIn, deployment.origin);
      expect(currentCookie).toMatch(/^(?:__Secure-)?folio\.session_token=/);
      // A stale legacy cookie must not override the current session, whatever
      // order the browser uses when sending the two cookie names.
      for (const cookie of [
        `${legacyCookie}; ${currentCookie}`,
        `${currentCookie}; ${legacyCookie}`,
      ]) {
        expect((await readServerSession(deployment, cookie))?.user.email).toBe(
          owner.email,
        );
      }
    },
  );

  it("does not let an HTTP Origin or Referer downgrade HTTPS authentication", async () => {
    const deployment: Deployment = {
      name: "HTTPS deployment",
      origin: "https://folio.example.com",
      forwardedProtocol: "https",
    };
    const insecureOrigin = "http://folio.example.com";
    await initialise();
    const setup = await ownerRoute.POST(ownerRequest(deployment));
    expect(setup.status).toBe(200);
    const setupCookie = acceptedSessionCookie(setup, deployment.origin);

    for (const proxied of [false, true]) {
      const headers = requestHeaders(deployment, setupCookie);
      headers.set("referer", `${insecureOrigin}/sign-in`);
      if (!proxied) headers.delete("x-forwarded-proto");
      const requestUrl = proxied
        ? "http://0.0.0.0:3000/api/auth/sign-in/email"
        : `${deployment.origin}/api/auth/sign-in/email`;
      headers.set("content-type", "application/json");

      const signIn = await authRoute.POST(new Request(requestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(owner),
      }));
      expect(signIn.status).toBe(200);
      const cookie = acceptedSessionCookie(signIn, deployment.origin);

      const sessionHeaders = requestHeaders(deployment, cookie);
      sessionHeaders.delete("origin");
      sessionHeaders.set("referer", `${insecureOrigin}/sign-in`);
      expect((await auth.getAuth(sessionHeaders).api.getSession({
        headers: sessionHeaders,
      }))?.user.email).toBe(owner.email);

      headers.set("origin", insecureOrigin);
      const rejected = await authRoute.POST(new Request(requestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(owner),
      }));
      expect(rejected.status).toBe(403);
      expect(rejected.headers.get("set-cookie")).toBeNull();
    }
  });

  it("rejects a foreign Origin without trusting X-Forwarded-Host", async () => {
    const deployment = deployments[0];
    await initialise();
    const foreignOrigin = "https://attacker.example";
    const setupRequest = ownerRequest(deployment);
    setupRequest.headers.set("origin", foreignOrigin);
    setupRequest.headers.set("x-forwarded-host", "attacker.example");
    expect((await ownerRoute.POST(setupRequest)).status).toBe(403);
    expect(await database!.db.selectFrom("auth_user").selectAll().execute()).toEqual([]);

    const setup = await ownerRoute.POST(ownerRequest(deployment));
    expect(setup.status).toBe(200);
    const cookie = acceptedSessionCookie(setup, deployment.origin);

    const spoofedLogin = authRequest(deployment, "sign-in/email", owner, cookie);
    spoofedLogin.headers.set("origin", foreignOrigin);
    spoofedLogin.headers.set("x-forwarded-host", "attacker.example");
    const rejected = await authRoute.POST(spoofedLogin);
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("set-cookie")).toBeNull();

    const legitimateLogin = authRequest(deployment, "sign-in/email", owner);
    legitimateLogin.headers.set("x-forwarded-host", "attacker.example");
    const accepted = await authRoute.POST(legitimateLogin);
    expect(accepted.status).toBe(200);
    expect(
      (await readServerSession(
        deployment,
        acceptedSessionCookie(accepted, deployment.origin),
      ))?.user.email,
    ).toBe(owner.email);
  });
});
