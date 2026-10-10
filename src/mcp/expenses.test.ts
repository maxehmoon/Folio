import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Business, Expense } from "@/lib/db/types";
import type { ToolRegistrar } from "./types";

vi.mock("@/lib/session", () => ({
  requireBusiness: () => { throw new Error("MCP must not use browser sessions."); },
}));

const timestamp = "2026-10-10T09:00:00.000Z";
const ownId = "00000000-0000-4000-8000-000000000001";
const foreignId = "00000000-0000-4000-8000-000000000002";
const image = "data:image/png;base64,iVBORw==";
const business: Business = {
  id: "business-1", owner_user_id: "owner-1", name: "Folio Studio", legal_name: null,
  email: "billing@example.com", phone: null, tax_id: null, address_line_1: null,
  address_line_2: null, city: null, region: null, postal_code: null,
  country_code: "GB", currency: "GBP", timezone: "Europe/London",
  invoice_prefix: "INV", next_invoice_number: 1, default_payment_terms_days: 30,
  payment_instructions: null, invoice_footer: null, logo_url: null,
  created_at: timestamp, updated_at: timestamp,
};
const expense: Expense = {
  id: ownId, business_id: business.id, vendor: "Paper & Pen", category: "Office",
  description: "Stationery", expense_date: "2026-10-09", currency: "GBP",
  subtotal_cents: 1250, tax_cents: 250, total_cents: 1500, reference: "REF-1",
  notes: "Keep this note", receipt_data_url: image, receipt_url: null,
  created_at: timestamp, updated_at: timestamp,
};
const createInput = {
  vendor: "  New vendor  ", category: " Office ", expense_date: "2026-10-10",
  currency: " gbp ", subtotal_cents: 1000,
};

let database: typeof import("@/lib/db");
const tools = new Map<string, (input: unknown) => Promise<unknown>>();
const register: ToolRegistrar = (name, config, handler) => {
  tools.set(name, async (input) => handler(z.object(config.inputSchema).strict().parse(input)));
};
const call = (name: string, input: unknown = {}) => {
  const handler = tools.get(`folio_${name}`);
  if (!handler) throw new Error(`Missing tool: ${name}`);
  return handler(input);
};
const stored = (id = ownId) => database.db.selectFrom("expenses").selectAll()
  .where("id", "=", id).executeTakeFirstOrThrow();

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.resetModules();
  database = await import("@/lib/db");
  await database.migrateDatabase();
  await database.db.insertInto("auth_user").values(["1", "2"].map((suffix) => ({
    id: `owner-${suffix}`, name: "Owner", email: `owner-${suffix}@example.com`,
    email_verified: 1, image: null, created_at: timestamp, updated_at: timestamp,
  }))).execute();
  await database.db.insertInto("businesses").values([
    business, { ...business, id: "business-2", owner_user_id: "owner-2" },
  ]).execute();
  const { registerExpenseTools } = await import("./expenses");
  registerExpenseTools(register, { business, userId: "owner-1", access: "write" });
});

beforeEach(async () => {
  await database.db.deleteFrom("expenses").execute();
  await database.db.insertInto("expenses").values([
    expense,
    { ...expense, id: foreignId, business_id: "business-2", vendor: "Private vendor" },
  ]).execute();
});

afterAll(async () => {
  await database?.closeDatabase();
  vi.unstubAllEnvs();
});

describe("MCP expenses", () => {
  it("creates validated, normalised expenses and derives totals", async () => {
    const created = await call("create_expense", {
      ...createInput, description: " ", reference: null,
    }) as { id: string };
    expect(created).toMatchObject({
      vendor: "New vendor", category: "Office", currency: "GBP", description: null,
      reference: null, notes: null, subtotal_cents: 1000, tax_cents: 0,
      total_cents: 1000, has_receipt: false,
    });
    expect(await stored(created.id)).toMatchObject({ business_id: business.id });
    expect(created).not.toHaveProperty("receipt_data_url");
  });

  it.each([
    { subtotal_cents: -1 }, { subtotal_cents: 1.2 }, { subtotal_cents: 0 },
    { subtotal_cents: 2_147_483_648 }, { subtotal_cents: 2_147_483_647, tax_cents: 1 },
    { expense_date: "2026-02-31" }, { currency: "ZZZ" },
  ])("rejects invalid expense input without inserting: %j", async (invalid) => {
    await expect(call("create_expense", { ...createInput, ...invalid })).rejects.toBeInstanceOf(z.ZodError);
    expect(await database.db.selectFrom("expenses").selectAll().execute()).toHaveLength(2);
  });

  it("preserves omitted fields, tax and receipts in partial updates", async () => {
    await call("update_expense", { id: ownId, changes: { vendor: "Updated vendor" } });
    expect(await stored()).toMatchObject({
      ...expense, vendor: "Updated vendor", updated_at: expect.any(String),
    });
    await call("update_expense", { id: ownId, changes: { subtotal_cents: 2000, notes: null } });
    expect(await stored()).toMatchObject({
      subtotal_cents: 2000, tax_cents: 250, total_cents: 2250, notes: null,
      receipt_data_url: image,
    });
  });

  it("validates the merged total and rejects empty or unknown patches", async () => {
    await expect(call("update_expense", {
      id: ownId, changes: { subtotal_cents: 2_147_483_647 },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(call("update_expense", {
      id: ownId, changes: { subtotal_cents: 0, tax_cents: 0 },
    })).rejects.toBeInstanceOf(z.ZodError);
    await expect(call("update_expense", { id: ownId, changes: {} })).rejects.toBeInstanceOf(z.ZodError);
    await expect(call("update_expense", {
      id: ownId, changes: { business_id: "business-2" },
    })).rejects.toBeInstanceOf(z.ZodError);
    expect(await stored()).toEqual(expense);
  });

  it("does not persist stale totals when monetary patches race", async () => {
    const results = await Promise.allSettled([
      call("update_expense", { id: ownId, changes: { subtotal_cents: 2000 } }),
      call("update_expense", { id: ownId, changes: { tax_cents: 500 } }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected", reason: { code: "CONFLICT" },
    });
    const row = await stored();
    expect(row.total_cents).toBe(row.subtotal_cents + row.tax_cents);
  });

  it("scopes listing, excludes images and escapes literal search wildcards", async () => {
    await database.db.insertInto("expenses").values([
      { ...expense, id: "00000000-0000-4000-8000-000000000003", vendor: "50%_! Paper" },
      { ...expense, id: "00000000-0000-4000-8000-000000000004", vendor: "50abcZ! Paper" },
    ]).execute();
    const result = await call("list_expenses", { q: "50%_! pAPER" }) as {
      expenses: unknown[];
      pagination: { total: number };
    };
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]).toMatchObject({ vendor: "50%_! Paper", has_receipt: true });
    expect(result.expenses[0]).not.toHaveProperty("receipt_data_url");
    expect(result.expenses[0]).not.toHaveProperty("receipt_url");
    expect(result.pagination.total).toBe(1);
    expect(await call("list_expenses", { q: "Private vendor" })).toMatchObject({
      expenses: [], pagination: { total: 0 },
    });
    expect(await call("get_expense", { id: ownId })).not.toHaveProperty("receipt_data_url");
  });

  it("filters dates, category and currency and paginates in stable order", async () => {
    const secondId = "00000000-0000-4000-8000-000000000003";
    await database.db.insertInto("expenses").values([
      { ...expense, id: secondId },
      { ...expense, id: "00000000-0000-4000-8000-000000000004", category: "Travel" },
      { ...expense, id: "00000000-0000-4000-8000-000000000005", currency: "EUR" },
      { ...expense, id: "00000000-0000-4000-8000-000000000006", expense_date: "2026-10-08" },
    ]).execute();
    const filters = { category: "Office", currency: "gbp", date_from: "2026-10-09", date_to: "2026-10-09", limit: 1 };
    expect(await call("list_expenses", filters)).toMatchObject({
      expenses: [{ id: ownId }], pagination: { total: 2, total_pages: 2, page: 1, limit: 1 },
    });
    expect(await call("list_expenses", { ...filters, page: 2 })).toMatchObject({
      expenses: [{ id: secondId }], pagination: { total: 2, page: 2 },
    });
  });

  it("rejects unbounded pagination and inverted date ranges", async () => {
    await expect(call("list_expenses", { limit: 101 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(call("list_expenses", { page: 10_001 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(call("list_expenses", {
      date_from: "2026-10-10", date_to: "2026-10-09",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it.each([
    ["get_expense", {}], ["update_expense", { changes: { vendor: "Leaked" } }],
    ["delete_expense", { confirm: true }], ["get_expense_receipt", {}],
    ["set_expense_receipt", { data_url: null }],
  ])("does not reveal or mutate another business through %s", async (name, input) => {
    await expect(call(name, { id: foreignId, ...input })).rejects.toMatchObject({
      code: "NOT_FOUND", message: "Expense not found.",
    });
    expect(await stored(foreignId)).toMatchObject({
      vendor: "Private vendor", receipt_data_url: image, business_id: "business-2",
    });
  });

  it("reads, replaces and removes receipts through the compatibility adapter", async () => {
    await database.db.updateTable("expenses").set({
      receipt_data_url: null, receipt_url: "https://example.com/receipt",
    }).where("id", "=", ownId).execute();
    expect(await call("get_expense_receipt", { id: ownId })).toEqual({
      id: ownId, receipt: { kind: "legacy-link", url: "https://example.com/receipt" },
    });
    await call("update_expense", { id: ownId, changes: { reference: "REF-2" } });
    expect(await stored()).toMatchObject({ receipt_url: "https://example.com/receipt" });
    expect(await call("set_expense_receipt", { id: ownId, data_url: image })).toMatchObject({ has_receipt: true });
    expect(await stored()).toMatchObject({ receipt_data_url: image, receipt_url: null });
    expect(await call("get_expense_receipt", { id: ownId })).toEqual({ id: ownId, receipt: { kind: "image", url: image } });
    expect(await call("set_expense_receipt", { id: ownId, data_url: null })).toMatchObject({ has_receipt: false });
    expect(await stored()).toMatchObject({ receipt_data_url: null, receipt_url: null });
    expect(await call("get_expense_receipt", { id: ownId })).toEqual({ id: ownId, receipt: null });
  });

  it("rejects invalid receipt types, malformed base64 and oversized images", async () => {
    for (const data_url of [
      "data:image/svg+xml;base64,PHN2ZyAvPg==", "data:image/png;base64,iVBORw=",
      `data:image/png;base64,${Buffer.alloc(512 * 1024 + 1).toString("base64")}`,
    ]) {
      await expect(call("set_expense_receipt", { id: ownId, data_url })).rejects.toBeInstanceOf(z.ZodError);
    }
    expect(await stored()).toMatchObject({ receipt_data_url: image });
  });

  it("requires confirmation before permanent deletion", async () => {
    await expect(call("delete_expense", { id: ownId })).rejects.toBeInstanceOf(z.ZodError);
    await expect(call("delete_expense", { id: ownId, confirm: false })).rejects.toBeInstanceOf(z.ZodError);
    expect(await stored()).toEqual(expense);
    expect(await call("delete_expense", { id: ownId, confirm: true })).toEqual({ id: ownId, deleted: true });
    await expect(call("get_expense", { id: ownId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
