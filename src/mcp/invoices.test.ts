import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { InvoiceDetail } from "@/features/invoices/types";
import type { Business } from "@/lib/db/types";
import type { McpContext, ToolRegistrar } from "./types";

let database: typeof import("@/lib/db");
let invoices: typeof import("./invoices");
let businesses: typeof import("@/lib/db/businesses");

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv("APP_SECRET", randomBytes(32).toString("hex"));
  vi.resetModules();
  database = await import("@/lib/db");
  await database.migrateDatabase();
  invoices = await import("./invoices");
  businesses = await import("@/lib/db/businesses");
});

afterAll(async () => {
  await database?.closeDatabase();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function fixture() {
  const userId = randomUUID();
  const timestamp = new Date().toISOString();
  await database.db.insertInto("auth_user").values({
    id: userId, name: "Synthetic owner", email: `${userId}@example.invalid`,
    email_verified: 1, image: null, created_at: timestamp, updated_at: timestamp,
  }).execute();
  const business = await businesses.ensureBusinessForUser({
    userId, name: "Synthetic studio", email: `${userId}@example.invalid`, currency: "GBP", timezone: "Europe/London",
    profile: { payment_instructions: "Synthetic bank details" },
  });
  const customerId = randomUUID();
  await database.db.insertInto("customers").values({
    id: customerId, business_id: business.id, name: "Synthetic customer", contact_name: null,
    email: null, phone: null, tax_id: null, address_line_1: null, address_line_2: null,
    city: null, region: null, postal_code: null, country_code: "GB", notes: null,
    archived_at: null, created_at: timestamp, updated_at: timestamp,
  }).execute();
  const context: McpContext = { business, userId, access: "write" };
  const tools = new Map<string, (input: unknown) => Promise<unknown>>();
  const register: ToolRegistrar = (name, config, handler) => {
    tools.set(name, async (input) => handler(z.object(config.inputSchema).strict().parse(input)));
  };
  invoices.registerInvoiceTools(register, context);
  const call = (name: string, input: unknown) => {
    const tool = tools.get(`folio_${name}`);
    if (!tool) throw new Error(`Missing tool ${name}`);
    return tool(input);
  };
  const input = {
    customerId, currency: "GBP", issueDate: "2026-10-10", dueDate: "2026-10-24", exchangeRateMicros: 1_000_000,
    lines: [{ description: "Synthetic service", unit: "hour", quantityThousandths: 1_500, unitPriceCents: 1_999, taxRateBps: 2_000 }],
  };
  const create = async () => await call("create_invoice", input) as InvoiceDetail;
  return { business, customerId, context, call, input, create };
}

async function invoiceCount(business: Business) {
  const row = await database.db.selectFrom("invoices").where("business_id", "=", business.id)
    .select(({ fn }) => fn.countAll<number>().as("total")).executeTakeFirstOrThrow();
  return Number(row.total);
}

describe("invoice MCP tools", () => {
  it("previews with exact line rounding and creates a matching draft without allocating a number", async () => {
    const f = await fixture();
    const preview = await f.call("preview_invoice", f.input) as { invoice: InvoiceDetail["invoice"]; lines: unknown[] };
    expect(preview.invoice).toMatchObject({ subtotal_cents: 2_999, tax_cents: 600, total_cents: 3_599, lifecycle: "draft", invoice_number: null });
    expect(await invoiceCount(f.business)).toBe(0);
    const created = await f.create();
    expect(created.invoice).toMatchObject({ subtotal_cents: 2_999, tax_cents: 600, total_cents: 3_599, payment_instructions: "Synthetic bank details" });
    expect(created.lines).toHaveLength(1);
    expect(await invoiceCount(f.business)).toBe(1);
    expect((await businesses.getBusinessByOwnerId(f.context.userId))!.next_invoice_number).toBe(1);
  });

  it("rejects invalid units, dates, unsupported currencies and total overflow without writes", async () => {
    const f = await fixture();
    for (const invalid of [
      { ...f.input, lines: [{ ...f.input.lines[0], quantityThousandths: 1.5 }] },
      { ...f.input, lines: [{ ...f.input.lines[0], taxRateBps: 10_001 }] },
      { ...f.input, lines: [{ ...f.input.lines[0], unitPriceCents: 2_147_483_647 }] },
      { ...f.input, lines: [] },
      { ...f.input, issueDate: "2026-02-30" },
      { ...f.input, dueDate: "2026-10-09" },
      { ...f.input, currency: "ZZZ" },
      { ...f.input, exchangeRateMicros: 2_000_000 },
    ]) await expect(f.call("create_invoice", invalid)).rejects.toThrow();
    expect(await invoiceCount(f.business)).toBe(0);
  });

  it("enforces ownership for customers, saved items, invoice reads, edits, issue and deletion", async () => {
    const f = await fixture();
    const other = await fixture();
    const created = await f.create();
    await expect(f.call("create_invoice", { ...f.input, customerId: other.customerId })).rejects.toThrow("valid customer");
    await expect(f.call("create_invoice", { ...f.input, lines: [{ ...f.input.lines[0], itemId: randomUUID() }] })).rejects.toThrow("saved items");
    const reference = { invoiceId: created.invoice.id, expectedUpdatedAt: created.invoice.updated_at };
    await expect(other.call("get_invoice", { invoiceId: created.invoice.id })).rejects.toThrow("not found");
    await expect(other.call("update_invoice", { ...other.input, ...reference })).rejects.toThrow("unavailable");
    await expect(other.call("issue_invoice", { ...reference, confirm: true })).rejects.toThrow("Only a draft");
    await expect(other.call("delete_draft_invoice", { ...reference, confirm: true })).rejects.toThrow("unavailable");
    expect((await f.call("get_invoice", { invoiceId: created.invoice.id }) as InvoiceDetail).invoice).toEqual(created.invoice);
  });

  it("guards stale edits, issues once and records published changes with the authenticated actor", async () => {
    const f = await fixture();
    const draft = await f.create();
    const changed = await f.call("update_invoice", { ...f.input, invoiceId: draft.invoice.id, expectedUpdatedAt: draft.invoice.updated_at, notes: "New draft" }) as InvoiceDetail;
    const stale = { invoiceId: draft.invoice.id, expectedUpdatedAt: draft.invoice.updated_at };
    await expect(f.call("update_invoice", { ...f.input, ...stale })).rejects.toThrow("changed");
    await expect(f.call("issue_invoice", { ...stale, confirm: true })).rejects.toThrow("changed");
    await expect(f.call("delete_draft_invoice", { ...stale, confirm: true })).rejects.toThrow("changed");
    expect((await businesses.getBusinessByOwnerId(f.context.userId))!.next_invoice_number).toBe(1);
    const issued = await f.call("issue_invoice", { invoiceId: draft.invoice.id, expectedUpdatedAt: changed.invoice.updated_at, confirm: true }) as InvoiceDetail;
    expect(issued.invoice).toMatchObject({ lifecycle: "issued", invoice_number: "INV-000001" });
    await expect(f.call("issue_invoice", { invoiceId: issued.invoice.id, expectedUpdatedAt: issued.invoice.updated_at, confirm: true })).rejects.toThrow("Only a draft");
    await expect(f.call("delete_draft_invoice", { invoiceId: issued.invoice.id, expectedUpdatedAt: issued.invoice.updated_at, confirm: true })).rejects.toThrow();
    const update = { ...f.input, invoiceId: issued.invoice.id, expectedUpdatedAt: issued.invoice.updated_at, notes: "Published correction" };
    await expect(f.call("update_invoice", update)).rejects.toThrow("Acknowledge");
    const amended = await f.call("update_invoice", { ...update, publishedEditConfirmed: true }) as InvoiceDetail;
    expect(amended.invoice.invoice_number).toBe(issued.invoice.invoice_number);
    expect(amended.invoice.notes).toBe("Published correction");
    const history = await f.call("list_invoice_revisions", { invoiceId: issued.invoice.id }) as { total: number; revisions: { id: string; actor_name: string }[] };
    expect(history.total).toBe(1);
    expect(history.revisions[0].actor_name).toBe("Synthetic owner");
    const revision = await f.call("get_invoice_revision", { invoiceId: issued.invoice.id, revisionId: history.revisions[0].id }) as { detail: InvoiceDetail; snapshot?: string };
    expect(revision.detail.invoice).toEqual(issued.invoice);
    expect(revision.snapshot).toBeUndefined();
    const other = await fixture();
    await expect(other.call("get_invoice_revision", { invoiceId: issued.invoice.id, revisionId: history.revisions[0].id })).rejects.toThrow("not found");
  });

  it("requires explicit issue/delete confirmation and deletes draft lines atomically", async () => {
    const f = await fixture();
    const draft = await f.create();
    const reference = { invoiceId: draft.invoice.id, expectedUpdatedAt: draft.invoice.updated_at };
    await expect(f.call("issue_invoice", reference)).rejects.toThrow();
    await expect(f.call("delete_draft_invoice", reference)).rejects.toThrow();
    expect(await f.call("delete_draft_invoice", { ...reference, confirm: true })).toEqual({ invoiceId: draft.invoice.id, deleted: true });
    expect(await invoiceCount(f.business)).toBe(0);
    expect(await database.db.selectFrom("invoice_lines").select("id").where("invoice_id", "=", draft.invoice.id).execute()).toEqual([]);
  });

  it("refreshes draft seller details without accepting a stale timestamp", async () => {
    const f = await fixture();
    const draft = await f.create();
    const futureTimestamp = new Date(Date.now() + 60_000).toISOString();
    await database.db.updateTable("invoices").set({ seller_name: "Previous seller", updated_at: futureTimestamp })
      .where("id", "=", draft.invoice.id).execute();
    const reference = { invoiceId: draft.invoice.id, expectedUpdatedAt: futureTimestamp };
    const refreshed = await f.call("refresh_invoice_seller", reference) as InvoiceDetail;
    expect(refreshed.invoice.seller_name).toBe(f.business.name);
    expect(refreshed.invoice.updated_at > futureTimestamp).toBe(true);
    await expect(f.call("refresh_invoice_seller", reference)).rejects.toThrow("changed");
    const issued = await f.call("issue_invoice", { invoiceId: draft.invoice.id, expectedUpdatedAt: refreshed.invoice.updated_at, confirm: true }) as InvoiceDetail;
    await expect(f.call("refresh_invoice_seller", { invoiceId: draft.invoice.id, expectedUpdatedAt: issued.invoice.updated_at })).rejects.toThrow("unavailable");
  });

  it("bounds listing and validates pages", async () => {
    const f = await fixture();
    const draft = await f.create();
    const listed = await f.call("list_invoices", { status: "draft", search: "Synthetic" }) as { invoices: InvoiceDetail["invoice"][]; pageSize: number; total: number };
    expect(listed.total).toBe(1);
    expect(listed.pageSize).toBe(25);
    expect(listed.invoices[0].id).toBe(draft.invoice.id);
    await expect(f.call("list_invoices", { page: 0 })).rejects.toThrow();
    await expect(f.call("list_invoice_revisions", { invoiceId: draft.invoice.id, pageSize: 51 })).rejects.toThrow();
  });

  it("provides a protected resource URI and renders the product PDF", async () => {
    const f = await fixture();
    const draft = await f.create();
    expect(await f.call("get_invoice_pdf", { invoiceId: draft.invoice.id })).toMatchObject({ uri: `folio://invoices/${draft.invoice.id}/pdf`, mimeType: "application/pdf" });
    const pdf = await invoices.readInvoicePdf(f.context, draft.invoice.id);
    expect(pdf).toMatchObject({ encoding: "base64", mimeType: "application/pdf" });
    expect(Buffer.from(pdf.data, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    const other = await fixture();
    await expect(invoices.readInvoicePdf(other.context, draft.invoice.id)).rejects.toThrow("not found");
  });
});
