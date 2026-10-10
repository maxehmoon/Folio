import { randomBytes, randomUUID } from "node:crypto";

import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Business, Customer, Database, InvoiceLifecycle, Payment } from "@/lib/db/types";

import type { ToolRegistrar } from "./types";

let databaseModule: typeof import("@/lib/db");
let aggregateModule: typeof import("@/features/invoices/aggregate");
let paymentTools: typeof import("./payments");
let database: Kysely<Database>;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv("APP_SECRET", randomBytes(32).toString("hex"));
  vi.resetModules();
  databaseModule = await import("@/lib/db");
  await databaseModule.migrateDatabase();
  [aggregateModule, paymentTools] = await Promise.all([
    import("@/features/invoices/aggregate"), import("./payments"),
  ]);
  database = databaseModule.db;
});

afterAll(async () => {
  await databaseModule?.closeDatabase();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function createFixture() {
  const timestamp = "2026-01-01T12:00:00.000Z";
  const ownerId = randomUUID();
  await database.insertInto("auth_user").values({
    id: ownerId, name: "Fictional owner", email: `${ownerId}@example.invalid`,
    email_verified: 1, image: null, created_at: timestamp, updated_at: timestamp,
  }).execute();
  const business: Business = {
    id: randomUUID(), owner_user_id: ownerId, name: "Fictional business",
    legal_name: null, email: `${ownerId}@example.invalid`, phone: null, tax_id: null,
    address_line_1: null, address_line_2: null, city: null, region: null,
    postal_code: null, country_code: "GB", currency: "GBP", timezone: "Europe/London",
    invoice_prefix: "TEST-", next_invoice_number: 1, default_payment_terms_days: 14,
    payment_instructions: null, invoice_footer: null, logo_url: null,
    created_at: timestamp, updated_at: timestamp,
  };
  const customer: Customer = {
    id: randomUUID(), business_id: business.id, name: "Fictional customer",
    billing_name: null, avatar_data_url: null, default_currency: null, contact_name: null,
    email: null, phone: null, tax_id: null, address_line_1: null,
    address_line_2: null, city: null, region: null, postal_code: null,
    country_code: null, notes: null, archived_at: null,
    created_at: timestamp, updated_at: timestamp,
  };
  await database.insertInto("businesses").values(business).execute();
  await database.insertInto("customers").values(customer).execute();

  const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
  const register: ToolRegistrar = (name, config, handler) => {
    handlers.set(name, async (input) => handler(z.object(config.inputSchema).parse(input)));
  };
  paymentTools.registerPaymentTools(register, { business, userId: ownerId, access: "write" });
  const call = async (name: string, input: unknown = {}) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`Missing payment tool: ${name}`);
    return handler(input);
  };

  const invoice = async (options: {
    lifecycle?: InvoiceLifecycle;
    totalCents?: number;
    currency?: string;
    dueDate?: string;
  } = {}) => {
    const id = randomUUID();
    const currency = options.currency ?? "GBP";
    const prepared = aggregateModule.prepareInvoiceAggregate({
      id, business, customer, recurringInvoiceId: null, recurrenceIndex: null,
      invoiceNumber: `TEST-${id}`, lifecycle: options.lifecycle ?? "issued",
      issueDate: "2026-01-01", dueDate: options.dueDate ?? "2026-01-15", currency,
      exchangeRate: { base: currency, quote: "GBP", rateMicros: 1_000_000,
        date: "2026-01-01", source: "Synthetic test rate" },
      notes: null, paymentInstructions: null, timestamp,
      lines: [{ itemId: null, description: "Fictional service", unit: "unit",
        quantityThousandths: 1_000, unitPriceCents: options.totalCents ?? 10_000, taxRateBps: 0 }],
    }, randomUUID);
    await aggregateModule.insertInvoiceAggregate(database, prepared);
    return id;
  };
  return { business, customer, call, invoice };
}

function paymentInput(invoiceId: string, amountCents = 4_000) {
  return { invoiceId, amountCents, currency: "GBP", paymentDate: "2026-01-20", method: "bank_transfer" };
}

describe("payment MCP tools", () => {
  it("records, filters, reads and deletes receipts without losing integer monetary amounts", async () => {
    const fixture = await createFixture();
    const invoiceId = await fixture.invoice();
    const recorded = await fixture.call("folio_record_payment", {
      ...paymentInput(invoiceId), reference: "Synthetic receipt", notes: "Synthetic payment note",
    }) as { payment: Payment };
    expect(recorded.payment).toMatchObject({
      business_id: fixture.business.id, invoice_id: invoiceId, amount_cents: 4_000,
      applied_amount_cents: 4_000, currency: "GBP", method: "bank_transfer",
      reference: "Synthetic receipt", notes: "Synthetic payment note",
    });
    await fixture.call("folio_record_payment", {
      ...paymentInput(invoiceId, 1_500), method: "cash", paymentDate: "2026-01-21",
    });
    const listed = await fixture.call("folio_list_payments", {
      customerId: fixture.customer.id, invoiceId, currency: "GBP", method: "bank_transfer",
      fromDate: "2026-01-20", toDate: "2026-01-20", pageSize: 1,
    });
    expect(listed).toMatchObject({
      payments: [expect.objectContaining({ id: recorded.payment.id, amount_cents: 4_000 })],
      page: 1, pageSize: 1, total: 1, totalPages: 1,
    });
    expect(await fixture.call("folio_get_payment", { paymentId: recorded.payment.id }))
      .toMatchObject({ payment: recorded.payment });
    await fixture.call("folio_delete_payment", { paymentId: recorded.payment.id, confirm: true });
    await expect(fixture.call("folio_get_payment", { paymentId: recorded.payment.id }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await database.selectFrom("payments").selectAll().where("invoice_id", "=", invoiceId).execute())
      .toEqual([expect.objectContaining({ amount_cents: 1_500, method: "cash" })]);
  });

  it("keeps every read and write within the authenticated business", async () => {
    const owner = await createFixture();
    const other = await createFixture();
    const invoiceId = await other.invoice();
    const result = await other.call("folio_record_payment", paymentInput(invoiceId)) as { payment: Payment };
    await expect(owner.call("folio_get_payment", { paymentId: result.payment.id }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(owner.call("folio_delete_payment", { paymentId: result.payment.id, confirm: true }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(owner.call("folio_record_payment", paymentInput(invoiceId)))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await owner.call("folio_list_payments", { invoiceId, customerId: other.customer.id }))
      .toMatchObject({ payments: [], total: 0 });
    expect(await owner.call("folio_list_payable_invoices", { customerId: other.customer.id }))
      .toMatchObject({ invoices: [], total: 0 });
    expect(await database.selectFrom("payments").selectAll().where("id", "=", result.payment.id).executeTakeFirst())
      .toEqual(result.payment);
  });

  it("serialises competing payments so their combined amount cannot exceed the balance", async () => {
    const fixture = await createFixture();
    const invoiceId = await fixture.invoice();
    const results = await Promise.allSettled([
      fixture.call("folio_record_payment", paymentInput(invoiceId, 6_000)),
      fixture.call("folio_record_payment", paymentInput(invoiceId, 6_000)),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected"))
      .toMatchObject({ reason: { code: "INVALID_INPUT" } });
    expect(await database.selectFrom("payments").selectAll().where("invoice_id", "=", invoiceId).execute())
      .toEqual([expect.objectContaining({ amount_cents: 6_000 })]);
  });

  it("uses allocated amounts after an invoice currency edit and rejects stale-currency receipts", async () => {
    const fixture = await createFixture();
    const invoiceId = await fixture.invoice();
    const original = await fixture.call("folio_record_payment", paymentInput(invoiceId)) as { payment: Payment };
    await database.updateTable("invoices").set({
      currency: "EUR", exchange_rate_micros: 800_000, subtotal_cents: 12_500, total_cents: 12_500,
    }).where("id", "=", invoiceId).execute();
    await database.updateTable("payments").set({ applied_amount_cents: 5_000 })
      .where("id", "=", original.payment.id).execute();
    expect(await fixture.call("folio_list_payable_invoices", { currency: "EUR" }))
      .toMatchObject({ invoices: [expect.objectContaining({ id: invoiceId, balanceDueCents: 7_500 })] });
    await expect(fixture.call("folio_record_payment", paymentInput(invoiceId, 1_000)))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    await fixture.call("folio_record_payment", { ...paymentInput(invoiceId, 7_500), currency: "EUR" });
    expect(await fixture.call("folio_list_payable_invoices", { currency: "EUR" }))
      .toMatchObject({ invoices: [], total: 0 });
    expect(await database.selectFrom("payments").selectAll().where("id", "=", original.payment.id).executeTakeFirst())
      .toMatchObject({ amount_cents: 4_000, currency: "GBP", applied_amount_cents: 5_000 });
  });

  it("rejects invalid amounts, dates, destructive confirmation and pagination before mutation", async () => {
    const fixture = await createFixture();
    const invoiceId = await fixture.invoice();
    for (const changed of [
      { amountCents: 0 }, { amountCents: -1 }, { amountCents: 1.5 },
      { amountCents: 2_147_483_648 }, { paymentDate: "2026-02-30" },
      { paymentDate: "20/01/2026" }, { method: "invalid" },
    ]) {
      await expect(fixture.call("folio_record_payment", { ...paymentInput(invoiceId), ...changed }))
        .rejects.toBeInstanceOf(z.ZodError);
    }
    await expect(fixture.call("folio_delete_payment", { paymentId: randomUUID(), confirm: false }))
      .rejects.toBeInstanceOf(z.ZodError);
    await expect(fixture.call("folio_list_payments", { pageSize: 101 }))
      .rejects.toBeInstanceOf(z.ZodError);
    await expect(fixture.call("folio_list_payable_invoices", { page: 10_001 }))
      .rejects.toBeInstanceOf(z.ZodError);
    expect(await database.selectFrom("payments").selectAll().where("invoice_id", "=", invoiceId).execute())
      .toEqual([]);
  });

  it("paginates payable invoices and excludes drafts, voids, settled balances and future due dates", async () => {
    const fixture = await createFixture();
    const first = await fixture.invoice({ dueDate: "2000-01-01" });
    const second = await fixture.invoice({ dueDate: "2000-01-02" });
    await fixture.invoice({ lifecycle: "draft" });
    await fixture.invoice({ lifecycle: "void" });
    await fixture.invoice({ currency: "EUR" });
    await fixture.invoice({ dueDate: "2999-01-01" });
    const settled = await fixture.invoice();
    await fixture.call("folio_record_payment", paymentInput(settled, 10_000));
    const filter = { currency: "GBP", customerId: fixture.customer.id, overdueOnly: true, pageSize: 1 };
    const pageOne = await fixture.call("folio_list_payable_invoices", filter) as { invoices: { id: string }[] };
    const pageTwo = await fixture.call("folio_list_payable_invoices", { ...filter, page: 2 }) as { invoices: { id: string }[] };
    expect(pageOne).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(pageTwo).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect([...pageOne.invoices, ...pageTwo.invoices].map((row) => row.id).sort())
      .toEqual([first, second].sort());
  });
});
