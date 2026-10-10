import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import type { RecurringInvoiceDetail } from "@/features/recurring/types";
import type { Business } from "@/lib/db/types";

import type { ToolRegistrar } from "./types";

type DatabaseModule = typeof import("@/lib/db");
let database: DatabaseModule;
let registerRecurringTools: typeof import("./recurring").registerRecurringTools;
const originalEnvironment = { DATABASE_URL: process.env.DATABASE_URL, DATABASE_DIALECT: process.env.DATABASE_DIALECT, APP_SECRET: process.env.APP_SECRET };
let business: Business;
let otherBusiness: Business;
let customerId: string;
let otherCustomerId: string;
let tools: Map<string, (input: Record<string, unknown>) => Promise<unknown>>;
let otherTools: typeof tools;

function registry(currentBusiness: Business) {
  const entries = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
  const register: ToolRegistrar = (name, config, handler) => {
    entries.set(name, (input) => handler(z.object(config.inputSchema).strict().parse(input)));
  };
  registerRecurringTools(register, { business: currentBusiness, userId: currentBusiness.owner_user_id, access: "write" });
  return entries;
}

function call(name: string, input: Record<string, unknown> = {}, registry = tools) {
  return registry.get(name)!(input);
}

const recurringInput = () => ({
  customerId,
  frequency: "month",
  startsOn: "2020-01-31",
  endsOn: "2020-01-31",
  currency: "GBP",
  lines: [{ description: "Design retainer", unit: "month", quantityThousandths: 1_250, unitPriceCents: 12_000, taxRateBps: 2_000 }],
});

async function create(input: Record<string, unknown> = {}, registry = tools) {
  return await call("folio_create_recurring_invoice", { ...recurringInput(), ...input }, registry) as RecurringInvoiceDetail;
}

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.DATABASE_DIALECT = "sqlite";
  process.env.APP_SECRET = "test-only-folio-secret-with-thirty-two-characters";
  database = await import("@/lib/db");
  await database.migrateDatabase();
  ({ registerRecurringTools } = await import("./recurring"));
});

beforeEach(async () => {
  const { ensureBusinessForUser } = await import("@/lib/db/businesses");
  const timestamp = database.nowIso();
  const fixtures: Array<{ business: Business; customerId: string }> = [];
  for (let index = 0; index < 2; index += 1) {
    const ownerId = database.newId();
    await database.db.insertInto("auth_user").values({
      id: ownerId, name: "Owner", email: `${ownerId}@example.test`, email_verified: 1,
      image: null, created_at: timestamp, updated_at: timestamp,
    }).execute();
    const currentBusiness = await ensureBusinessForUser({ userId: ownerId, name: "Studio", email: `${ownerId}@example.test`, currency: "GBP", timezone: "Europe/London" });
    const currentCustomerId = database.newId();
    await database.db.insertInto("customers").values({
      id: currentCustomerId, business_id: currentBusiness.id, name: "Northstar", contact_name: null,
      email: null, phone: null, tax_id: null, address_line_1: null, address_line_2: null,
      city: null, region: null, postal_code: null, country_code: "GB", notes: null,
      archived_at: null, created_at: timestamp, updated_at: timestamp,
    }).execute();
    fixtures.push({ business: currentBusiness, customerId: currentCustomerId });
  }
  ({ business, customerId } = fixtures[0]);
  otherBusiness = fixtures[1].business;
  otherCustomerId = fixtures[1].customerId;
  tools = registry(business);
  otherTools = registry(otherBusiness);
});

afterAll(async () => {
  if (database) await database.closeDatabase();
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("recurring MCP tools", () => {
  it("stores integer units exactly and returns totals with complete pagination", async () => {
    const first = await create();
    await create();
    expect(first.lines[0]).toMatchObject({ quantity_thousandths: 1_250, unit_price_cents: 12_000, tax_rate_bps: 2_000 });
    const page = await call("folio_list_recurring_invoices", { limit: 1 }) as { recurringInvoices: Array<{ id: string; totalCents: number }>; nextOffset: number };
    expect(page.recurringInvoices).toHaveLength(1);
    expect(page.recurringInvoices[0].totalCents).toBe(18_000);
    expect(page.nextOffset).toBe(1);
    const next = await call("folio_list_recurring_invoices", { limit: 1, offset: page.nextOffset }) as typeof page;
    expect(next.recurringInvoices[0].id).not.toBe(page.recurringInvoices[0].id);
    expect(next.nextOffset).toBeNull();
  });

  it("rejects invalid dates, fractional integer units, reversed ranges and excessive line totals", async () => {
    await expect(create({ startsOn: "2026-02-30" })).rejects.toThrow();
    await expect(create({ endsOn: "2019-01-01" })).rejects.toThrow("End date cannot be before");
    await expect(create({ lines: [{ ...recurringInput().lines[0], quantityThousandths: 1.5 }] })).rejects.toThrow();
    await expect(create({ lines: [{ ...recurringInput().lines[0], quantityThousandths: 2_147_483_647, unitPriceCents: 2_147_483_647 }] })).rejects.toThrow("too large");
    expect(await database.db.selectFrom("recurring_invoices").select("id").where("business_id", "=", business.id).execute()).toHaveLength(0);
  });

  it("does not read, mutate or attach another business's entities", async () => {
    const foreign = await create({ customerId: otherCustomerId }, otherTools);
    await expect(create({ customerId: otherCustomerId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const tool of ["folio_get_recurring_invoice", "folio_pause_recurring_invoice", "folio_recurring_invoice_history"]) {
      await expect(call(tool, { id: foreign.recurringInvoice.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(call("folio_update_recurring_invoice", {
      ...recurringInput(), id: foreign.recurringInvoice.id, expectedUpdatedAt: foreign.recurringInvoice.updated_at,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await call("folio_list_recurring_invoices")).toMatchObject({ recurringInvoices: [] });
    expect((await call("folio_get_recurring_invoice", { id: foreign.recurringInvoice.id }, otherTools) as RecurringInvoiceDetail).recurringInvoice.state).toBe("active");
  });

  it("previews anchored month-end dates and rejects dates outside the supported calendar", async () => {
    expect(await call("folio_preview_recurring_dates", { startsOn: "2028-01-31", frequency: "month", endsOn: "2028-03-31", count: 5, paymentTermsDays: 14 })).toEqual({ dates: [
      { occurrenceIndex: 0, issueDate: "2028-01-31", dueDate: "2028-02-14" },
      { occurrenceIndex: 1, issueDate: "2028-02-29", dueDate: "2028-03-14" },
      { occurrenceIndex: 2, issueDate: "2028-03-31", dueDate: "2028-04-14" },
    ] });
    await expect(call("folio_preview_recurring_dates", { startsOn: "9999-12-31", frequency: "year", count: 2 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(call("folio_preview_recurring_dates", { startsOn: "2028-01-31", endsOn: "2027-01-01", frequency: "month" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("preserves occurrence progress on edits and rejects stale writes", async () => {
    const created = await create();
    await database.db.updateTable("recurring_invoices").set({ next_occurrence_index: 2, next_issue_date: "2020-03-31", updated_at: "2020-01-01T00:00:00.000Z" }).where("id", "=", created.recurringInvoice.id).execute();
    await expect(call("folio_update_recurring_invoice", { ...recurringInput(), id: created.recurringInvoice.id, expectedUpdatedAt: created.recurringInvoice.updated_at })).rejects.toMatchObject({ code: "CONFLICT" });
    const updated = await call("folio_update_recurring_invoice", {
      ...recurringInput(), id: created.recurringInvoice.id, endsOn: null, expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
      lines: [{ ...recurringInput().lines[0], description: "Updated service" }],
    }) as RecurringInvoiceDetail;
    expect(updated.recurringInvoice).toMatchObject({ next_occurrence_index: 2, next_issue_date: "2020-03-31" });
    expect(updated.lines).toHaveLength(1);
    expect(updated.lines[0].description).toBe("Updated service");
  });

  it("supports idempotent pause/resume/end with no resurrection of ended schedules", async () => {
    const { recurringInvoice } = await create();
    for (const action of ["pause", "pause", "resume", "resume", "end", "end"]) {
      const result = await call(`folio_${action}_recurring_invoice`, { id: recurringInvoice.id }) as RecurringInvoiceDetail;
      expect(result.recurringInvoice.state).toBe(action === "pause" ? "paused" : action === "resume" ? "active" : "ended");
    }
    await expect(call("folio_resume_recurring_invoice", { id: recurringInvoice.id })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("runs only the authenticated business's due schedules and deduplicates invoices", async () => {
    const own = await create();
    const foreign = await create({ customerId: otherCustomerId }, otherTools);
    await expect(call("folio_run_due_recurring_invoices", { throughDate: "9999-12-31" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await call("folio_run_due_recurring_invoices", { throughDate: "2020-01-31" })).toMatchObject({ generated: 1, failed: 0 });
    expect(await call("folio_run_due_recurring_invoices", { throughDate: "2020-01-31" })).toMatchObject({ generated: 0, failed: 0 });
    const invoices = await database.db.selectFrom("invoices").select(["business_id", "recurring_invoice_id", "total_cents"]).where("business_id", "in", [business.id, otherBusiness.id]).execute();
    expect(invoices).toEqual([{ business_id: business.id, recurring_invoice_id: own.recurringInvoice.id, total_cents: 18_000 }]);
    expect(await call("folio_recurring_invoice_history", { id: own.recurringInvoice.id })).toMatchObject({ runs: [{ status: "completed", occurrence_index: 0 }], nextOffset: null });
    expect(await call("folio_recurring_invoice_history", { id: foreign.recurringInvoice.id }, otherTools)).toEqual({ runs: [], nextOffset: null });
  });

  it("returns actionable known failures without disclosing internal error details", async () => {
    const { recurringInvoice } = await create();
    await database.db.deleteFrom("recurring_invoice_lines").where("recurring_invoice_id", "=", recurringInvoice.id).execute();
    expect(await call("folio_run_due_recurring_invoices", { throughDate: "2020-01-31" })).toMatchObject({
      failed: 1,
      errors: [{ recurringInvoiceId: recurringInvoice.id, message: "The recurring invoice has no line items" }],
    });
    await database.db.updateTable("recurring_runs").set({ error_message: "Database error: postgresql://owner:secret@private.example" })
      .where("recurring_invoice_id", "=", recurringInvoice.id).execute();
    const history = await call("folio_recurring_invoice_history", { id: recurringInvoice.id });
    expect(history).toMatchObject({ runs: [{ status: "failed", error_message: "Generation failed; check the schedule and server logs for details" }] });
    expect(JSON.stringify(history)).not.toContain("secret");
  });
});
