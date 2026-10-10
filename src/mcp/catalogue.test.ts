import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Business } from "@/lib/db/types";
import type { ToolRegistrar } from "./types";

type DatabaseModule = typeof import("@/lib/db");
type RegisteredTool = {
  schema: z.ZodObject<z.ZodRawShape>;
  readOnly: boolean;
  call: (input: unknown) => Promise<Record<string, unknown>>;
};

let database: DatabaseModule;
let firstBusiness: Business;
let secondBusiness: Business;
let registerCatalogueTools: typeof import("./catalogue").registerCatalogueTools;
let first: Map<string, RegisteredTool>;
let second: Map<string, RegisteredTool>;

function toolsFor(business: Business) {
  const tools = new Map<string, RegisteredTool>();
  const register: ToolRegistrar = (name, config, handler) => {
    const schema = z.object(config.inputSchema).strict();
    tools.set(name, {
      schema,
      readOnly: config.readOnly === true,
      call: async (input) => await handler(schema.parse(input)) as Record<string, unknown>,
    });
  };
  registerCatalogueTools(register, { business, userId: business.owner_user_id, access: "write" });
  return tools;
}

function call(name: string, input: unknown = {}, tools = first) {
  const tool = tools.get(`folio_${name}`);
  if (!tool) throw new Error(`Missing test tool: ${name}`);
  return tool.call(input);
}

beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "a".repeat(64));
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.resetModules();
  database = await import("@/lib/db");
  await database.migrateDatabase();
  const { ensureBusinessForUser } = await import("@/lib/db/businesses");
  const businesses: Business[] = [];
  for (const name of ["First business", "Second business"]) {
    const id = randomUUID();
    await database.db.insertInto("auth_user").values({
      id, name, email: `${id}@example.com`, email_verified: 1, image: null,
      created_at: database.nowIso(), updated_at: database.nowIso(),
    }).execute();
    businesses.push(await ensureBusinessForUser({ userId: id, name, email: `${id}@example.com`, currency: "GBP" }));
  }
  [firstBusiness, secondBusiness] = businesses;
  ({ registerCatalogueTools } = await import("./catalogue"));
  first = toolsFor(firstBusiness);
  second = toolsFor(secondBusiness);
});

beforeEach(async () => {
  await database.db.deleteFrom("customers").execute();
  await database.db.deleteFrom("items").execute();
});

afterAll(async () => {
  await database?.closeDatabase();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("MCP catalogue tools", () => {
  it("creates and patches customers using the product's normalisation and validation", async () => {
    const created = await call("create_customer", {
      name: "  Ada Ltd  ", email: "ada@example.com", country_code: "gb", notes: "Keep this note",
    });
    expect(created).toMatchObject({
      name: "Ada Ltd", email: "ada@example.com", country_code: "GB",
      contact_name: null, has_avatar: false,
    });
    const patched = await call("update_customer", { id: created.id, changes: { name: "Ada & Co", email: null } });
    expect(patched).toMatchObject({ name: "Ada & Co", email: null, notes: "Keep this note", country_code: "GB" });
    await expect(call("update_customer", { id: created.id, changes: { email: "invalid" } })).rejects.toThrow();
    await expect(call("update_customer", { id: created.id, changes: {} })).rejects.toThrow();
    await expect(call("create_customer", { name: "Bad", country_code: "XX" })).rejects.toThrow();
    await expect(call("create_customer", { name: "Bad", business_id: secondBusiness.id })).rejects.toThrow();
    expect(await call("get_customer", { id: created.id })).toEqual(patched);
  });

  it("archives and restores idempotently, and filters literal customer searches with bounded pagination", async () => {
    const percent = await call("create_customer", { name: "100% Design" });
    await call("create_customer", { name: "Other Design" });
    const archived = await call("archive_customer", { id: percent.id });
    expect(archived.archived_at).toEqual(expect.any(String));
    expect(await call("archive_customer", { id: percent.id })).toEqual(archived);
    expect((await call("list_customers")).customers).toHaveLength(1);
    const found = await call("list_customers", { q: "% deSIGN", status: "all", limit: 1 });
    expect(found.customers).toEqual([archived]);
    expect(found.pagination).toMatchObject({ page: 1, limit: 1, total: 1, total_pages: 1 });
    const restored = await call("restore_customer", { id: percent.id });
    expect(restored.archived_at).toBeNull();
    expect(await call("restore_customer", { id: percent.id })).toEqual(restored);
    await expect(call("list_customers", { limit: 101 })).rejects.toThrow();
    await expect(call("list_customers", { page: 0 })).rejects.toThrow();
  });

  it("keeps avatar blobs out of customer reads and lists while supporting explicit retrieval and removal", async () => {
    const customer = await call("create_customer", { name: "Image customer" });
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    const updated = await call("set_customer_avatar", { id: customer.id, data_url: dataUrl });
    expect(updated.has_avatar).toBe(true);
    expect(updated).not.toHaveProperty("avatar_data_url");
    expect(JSON.stringify(await call("list_customers"))).not.toContain(dataUrl);
    expect(await call("get_customer_avatar", { id: customer.id })).toEqual({ id: customer.id, avatar_data_url: dataUrl });
    await expect(call("set_customer_avatar", { id: customer.id, data_url: "data:image/svg+xml;base64,PHN2Zz4=" })).rejects.toThrow();
    await expect(call("set_customer_avatar", { id: customer.id, data_url: "data:image/png;base64,%%%%" })).rejects.toThrow();
    const removed = await call("set_customer_avatar", { id: customer.id, data_url: null });
    expect(removed.has_avatar).toBe(false);
    expect(await call("get_customer_avatar", { id: customer.id })).toEqual({ id: customer.id, avatar_data_url: null });
  });

  it("uses exact integer item prices, preserves omitted tax on patch, and rejects invalid money", async () => {
    const item = await call("create_item", {
      name: "Consulting", unit: "hour", unit_price_cents: 12_345, tax_rate_bps: 2_000, currency: "gbp", description: "Details",
    });
    expect(item).toMatchObject({ unit_price_cents: 12_345, tax_rate_bps: 2_000, currency: "GBP" });
    const patched = await call("update_item", { id: item.id, changes: { name: "Consultation", description: null } });
    expect(patched).toMatchObject({ name: "Consultation", description: null, unit_price_cents: 12_345, tax_rate_bps: 2_000 });
    const max = await call("create_item", { name: "Maximum", unit: "item", unit_price_cents: 2_147_483_647, currency: "GBP" });
    expect(max).toMatchObject({ unit_price_cents: 2_147_483_647, tax_rate_bps: 0 });
    for (const changes of [{ unit_price_cents: -1 }, { unit_price_cents: 12.5 }, { unit_price_cents: 2_147_483_648 }, { tax_rate_bps: 10_001 }, {}]) {
      await expect(call("update_item", { id: item.id, changes })).rejects.toThrow();
    }
    expect(await call("get_item", { id: item.id })).toEqual(patched);
  });

  it("archives items idempotently and supports currency and literal text filters", async () => {
    const item = await call("create_item", { name: "Design_50%", unit: "item", unit_price_cents: 100, currency: "GBP" });
    await call("create_item", { name: "Design service", unit: "item", unit_price_cents: 100, currency: "EUR" });
    const archived = await call("archive_item", { id: item.id });
    expect(await call("archive_item", { id: item.id })).toEqual(archived);
    expect((await call("list_items")).items).toHaveLength(1);
    expect((await call("list_items", { status: "all", currency: "gbp", q: "_50%" })).items).toEqual([archived]);
    const restored = await call("restore_item", { id: item.id });
    expect(restored.archived_at).toBeNull();
    expect(await call("restore_item", { id: item.id })).toEqual(restored);
  });

  it("scopes every customer and item operation to the authenticated business", async () => {
    const customer = await call("create_customer", { name: "Private customer" }, second);
    const item = await call("create_item", { name: "Private item", unit: "item", unit_price_cents: 100, currency: "GBP" }, second);
    const customerCalls = [
      ["get_customer", {}], ["update_customer", { changes: { name: "Stolen" } }],
      ["archive_customer", {}], ["restore_customer", {}], ["get_customer_avatar", {}],
      ["set_customer_avatar", { data_url: null }],
    ] as const;
    for (const [name, input] of customerCalls) {
      await expect(call(name, { ...input, id: customer.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    for (const [name, input] of [
      ["get_item", {}], ["update_item", { changes: { name: "Stolen" } }],
      ["archive_item", {}], ["restore_item", {}],
    ] as const) {
      await expect(call(name, { ...input, id: item.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect((await call("list_customers", { status: "all" })).customers).toEqual([]);
    expect((await call("list_items", { status: "all" })).items).toEqual([]);
    expect(await call("get_customer", { id: customer.id }, second)).toEqual(customer);
    expect(await call("get_item", { id: item.id }, second)).toEqual(item);
  });

  it("publishes JSON-compatible schemas and marks only read tools as read-only", () => {
    expect(first.size).toBe(14);
    for (const [name, tool] of first) {
      expect(() => z.toJSONSchema(tool.schema, { io: "input" })).not.toThrow();
      expect(tool.readOnly).toBe(name.startsWith("folio_get_") || name.startsWith("folio_list_"));
    }
  });
});
