import { createHash } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Business } from "@/lib/db/types";

type DatabaseModule = typeof import("@/lib/db");
type TokensModule = typeof import("@/features/mcp/tokens");
type AuthModule = typeof import("./auth");
type ActionsModule = typeof import("@/features/mcp/actions");

let database: DatabaseModule;
let tokens: TokensModule;
let auth: AuthModule;
let actions: ActionsModule;
let business: Business;
let otherBusiness: Business;
const requireBusiness = vi.fn();

function request(token?: string) {
  return new Request("https://folio.example/api/mcp", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("APP_SECRET", "mcp-auth-test-secret-".repeat(4));
  vi.resetModules();
  database = await import("@/lib/db");
  await database.migrateDatabase();
  await database.migrateDatabase();
  const { ensureBusinessForUser } = await import("@/lib/db/businesses");
  for (const id of ["owner", "other-owner"]) {
    await database.db.insertInto("auth_user").values({
      id,
      name: id,
      email: `${id}@example.com`,
      email_verified: 0,
      image: null,
      created_at: database.nowIso(),
      updated_at: database.nowIso(),
    }).execute();
  }
  business = await ensureBusinessForUser({ userId: "owner", name: "Business", email: "owner@example.com" });
  otherBusiness = await ensureBusinessForUser({ userId: "other-owner", name: "Other business", email: "other-owner@example.com" });
  tokens = await import("@/features/mcp/tokens");
  auth = await import("./auth");
  vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
  vi.doMock("@/lib/session", () => ({ requireBusiness }));
  actions = await import("@/features/mcp/actions");
});

beforeEach(async () => {
  await database.db.deleteFrom("mcp_access_tokens").execute();
  requireBusiness.mockReset().mockResolvedValue(business);
});

afterAll(async () => {
  await database?.closeDatabase();
  vi.unstubAllEnvs();
  vi.doUnmock("next/cache");
  vi.doUnmock("@/lib/session");
  vi.resetModules();
});

describe("MCP access tokens", () => {
  it("stores only a hash and identifying prefix, defaults to read access and expires after 30 days", async () => {
    const created = await tokens.createMcpToken(business.id, { label: " My assistant " });
    expect(created.token).toMatch(/^folio_mcp_[A-Za-z0-9_-]{43}$/);
    const row = await database.db.selectFrom("mcp_access_tokens").selectAll().where("id", "=", created.id).executeTakeFirstOrThrow();
    expect(row.label).toBe("My assistant");
    expect(row.access).toBe("read");
    expect(row.token_hash).toBe(createHash("sha256").update(created.token).digest("hex"));
    expect(row.token_prefix).toBe(created.token.slice(0, 18));
    expect(JSON.stringify(row)).not.toContain(created.token);
    expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBe(30 * 86_400_000);
    const listed = await tokens.listMcpTokens(business.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("token_hash");
    expect(JSON.stringify(listed)).not.toContain(created.token);
  });

  it("authenticates the token's business and its owner without changing the token", async () => {
    const created = await tokens.createMcpToken(otherBusiness.id, { label: "Writer", access: "write", expiryDays: 90 });
    const before = await database.db.selectFrom("mcp_access_tokens").selectAll().execute();
    await expect(auth.authenticateMcpRequest(request(created.token))).resolves.toEqual({
      business: otherBusiness,
      userId: otherBusiness.owner_user_id,
      access: "write",
    });
    const after = await database.db.selectFrom("mcp_access_tokens").selectAll().execute();
    expect(after).toEqual(before);
    expect(await tokens.listMcpTokens(business.id)).toEqual([]);
  });

  it("does not accept cookies, query parameters, basic authentication or malformed bearer values", async () => {
    const created = await tokens.createMcpToken(business.id, { label: "Reader" });
    const requests = [
      request(),
      new Request(`https://folio.example/api/mcp?token=${created.token}&access_token=${created.token}`),
      new Request("https://folio.example/api/mcp", { headers: { cookie: `folio.session_token=${created.token}` } }),
      new Request("https://folio.example/api/mcp", { headers: { authorization: `Basic ${created.token}` } }),
      new Request("https://folio.example/api/mcp", { headers: { authorization: `Bearer ${created.token}, Bearer ${created.token}` } }),
      request(created.token.slice(0, -1)),
      request(`folio_mcp_${"a".repeat(43)}`),
    ];
    for (const candidate of requests) {
      await expect(auth.authenticateMcpRequest(candidate)).resolves.toBeNull();
    }
    await expect(auth.authenticateMcpRequest(new Request("https://folio.example/api/mcp", {
      headers: { authorization: `bearer ${created.token}` },
    }))).resolves.toMatchObject({ access: "read" });
  });

  it("rejects expired tokens, including the precise expiry boundary", async () => {
    const created = await tokens.createMcpToken(business.id, { label: "Reader" });
    const expiry = "2026-10-10T12:00:00.000Z";
    await database.db.updateTable("mcp_access_tokens").set({ expires_at: expiry }).where("id", "=", created.id).execute();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-10T11:59:59.999Z"));
      await expect(auth.authenticateMcpRequest(request(created.token))).resolves.toMatchObject({ access: "read" });
      vi.setSystemTime(new Date(expiry));
      await expect(auth.authenticateMcpRequest(request(created.token))).resolves.toBeNull();
      vi.setSystemTime(new Date("2026-10-11T00:00:00.000Z"));
      await expect(auth.authenticateMcpRequest(request(created.token))).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("scopes revocation to the business and rejects revoked tokens immediately", async () => {
    const created = await tokens.createMcpToken(business.id, { label: "Reader" });
    await tokens.revokeMcpToken(otherBusiness.id, created.id);
    await expect(auth.authenticateMcpRequest(request(created.token))).resolves.toMatchObject({ access: "read" });
    await tokens.revokeMcpToken(business.id, created.id);
    await expect(auth.authenticateMcpRequest(request(created.token))).resolves.toBeNull();
    await tokens.revokeMcpToken(business.id, created.id);
    expect((await tokens.listMcpTokens(business.id))[0].revoked_at).not.toBeNull();
  });

  it("validates names, access levels and bounded expiry choices before persisting", async () => {
    for (const input of [
      { label: "" },
      { label: "a".repeat(81) },
      { label: "Reader", access: "admin" },
      { label: "Reader", expiryDays: 0 },
      { label: "Reader", expiryDays: 366 },
    ]) {
      expect(tokens.createMcpTokenSchema.safeParse(input).success).toBe(false);
    }
    await expect(tokens.createMcpToken(business.id, { label: " " })).rejects.toThrow();
    expect(await tokens.listMcpTokens(business.id)).toEqual([]);
    const created = await tokens.createMcpToken(business.id, { label: "Year", expiryDays: 365 });
    expect(created.id).toBeTruthy();
  });

  it("removes credentials when their business is deleted", async () => {
    const { ensureBusinessForUser } = await import("@/lib/db/businesses");
    const disposable = await ensureBusinessForUser({ userId: "other-owner", name: "Other business", email: "other-owner@example.com" });
    const created = await tokens.createMcpToken(disposable.id, { label: "Temporary" });
    await database.db.deleteFrom("businesses").where("id", "=", disposable.id).execute();
    await expect(auth.authenticateMcpRequest(request(created.token))).resolves.toBeNull();
    expect(await tokens.listMcpTokens(disposable.id)).toEqual([]);
  });
});

describe("MCP token management actions", () => {
  it("derives ownership from the signed-in business and never from submitted fields", async () => {
    const form = new FormData();
    form.set("label", "Assistant");
    form.set("business_id", "someone-else");
    const created = await actions.createMcpTokenAction({}, form);
    expect(created.error).toBeUndefined();
    expect(created.created).toBeDefined();
    expect(await tokens.listMcpTokens(business.id)).toHaveLength(1);
    expect(await tokens.listMcpTokens("someone-else")).toEqual([]);
    await expect(auth.authenticateMcpRequest(request(created.created?.token))).resolves.toMatchObject({
      userId: business.owner_user_id,
      access: "read",
    });
    await actions.revokeMcpTokenAction(created.created!.id);
    await expect(auth.authenticateMcpRequest(request(created.created?.token))).resolves.toBeNull();
  });

  it("requires an authenticated business before creating or revoking credentials", async () => {
    const created = await tokens.createMcpToken(business.id, { label: "Reader" });
    requireBusiness.mockRejectedValue(new Error("Sign in required"));
    const form = new FormData();
    form.set("label", "Assistant");
    await expect(actions.createMcpTokenAction({}, form)).rejects.toThrow("Sign in required");
    await expect(actions.revokeMcpTokenAction(created.id)).rejects.toThrow("Sign in required");
    expect(await tokens.listMcpTokens(business.id)).toHaveLength(1);
    await expect(auth.authenticateMcpRequest(request(created.token))).resolves.toMatchObject({ access: "read" });
  });

  it("rejects invalid form fields without returning a credential", async () => {
    const form = new FormData();
    form.set("label", "Assistant");
    form.set("access", "admin");
    form.set("expiryDays", "999");
    const state = await actions.createMcpTokenAction({}, form);
    expect(state.error).toBeTruthy();
    expect(state.created).toBeUndefined();
    expect(await tokens.listMcpTokens(business.id)).toEqual([]);
  });
});
