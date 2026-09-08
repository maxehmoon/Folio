import { randomBytes, randomInt, randomUUID } from "node:crypto";

import type { Kysely } from "kysely";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Business, Customer, Database, InvoiceLifecycle } from "@/lib/db/types";
import { todayInTimeZone } from "@/lib/format";

import type { PreparedInvoiceAggregate } from "./aggregate";
import type { InvoiceDetail } from "./types";

let databaseModule: typeof import("@/lib/db");
let aggregateModule: typeof import("./aggregate");
let editModule: typeof import("./edits");
let detailModule: typeof import("./detail-query");
let database: Kysely<Database>;
const postgresUrl = process.env.TEST_POSTGRES_DATABASE_URL;
const postgresSchema = `edits_test_${randomUUID().replaceAll("-", "")}`;
let postgresAdmin: Client | undefined;
let postgresSchemaCreated = false;

beforeAll(async () => {
  if (postgresUrl) {
    postgresAdmin = new Client({ connectionString: postgresUrl });
    await postgresAdmin.connect();
    await postgresAdmin.query(`CREATE SCHEMA "${postgresSchema}"`);
    postgresSchemaCreated = true;
    const isolatedUrl = new URL(postgresUrl);
    isolatedUrl.searchParams.set("options", `-c search_path=${postgresSchema}`);
    vi.stubEnv("DATABASE_URL", isolatedUrl.toString());
    vi.stubEnv("DATABASE_DIALECT", "postgres");
  } else {
    vi.stubEnv("DATABASE_URL", ":memory:");
    vi.stubEnv("DATABASE_DIALECT", "sqlite");
  }
  vi.stubEnv("APP_SECRET", randomBytes(32).toString("hex"));
  vi.resetModules();
  databaseModule = await import("@/lib/db");
  await databaseModule.migrateDatabase();
  [aggregateModule, editModule, detailModule] = await Promise.all([
    import("./aggregate"), import("./edits"), import("./detail-query"),
  ]);
  database = databaseModule.db;
});

afterAll(async () => {
  try {
    await databaseModule?.closeDatabase();
    if (postgresSchemaCreated) await postgresAdmin?.query(`DROP SCHEMA "${postgresSchema}" CASCADE`);
  } finally {
    await postgresAdmin?.end();
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});

async function createFixture(lifecycle: InvoiceLifecycle = "issued") {
  const timestamp = new Date(Date.now() - randomInt(2, 30) * 86_400_000).toISOString();
  const ownerId = randomUUID();
  await database.insertInto("auth_user").values({
    id: ownerId, name: `Fictional owner ${randomUUID()}`, email: `${randomUUID()}@example.invalid`,
    email_verified: postgresUrl ? true : 1, image: null, created_at: timestamp, updated_at: timestamp,
  }).execute();
  const business: Business = {
    id: randomUUID(), owner_user_id: ownerId, name: `Fictional business ${randomUUID()}`,
    legal_name: null, email: `${randomUUID()}@example.invalid`, phone: null,
    tax_id: `Synthetic tax ${randomUUID()}`, address_line_1: `Fictional address ${randomUUID()}`,
    address_line_2: null, city: null, region: null, postal_code: null, country_code: "GB",
    currency: "GBP", timezone: "Europe/London", invoice_prefix: `SYN-${randomUUID()}`,
    next_invoice_number: randomInt(20, 900), default_payment_terms_days: randomInt(7, 31),
    payment_instructions: `Synthetic instructions ${randomUUID()}`,
    invoice_footer: `Synthetic footer ${randomUUID()}`, logo_url: null,
    created_at: timestamp, updated_at: timestamp,
  };
  const customer: Customer = {
    id: randomUUID(), business_id: business.id, name: `Fictional customer ${randomUUID()}`,
    avatar_data_url: null, default_currency: null, contact_name: null,
    email: `${randomUUID()}@example.invalid`, phone: null, tax_id: `Synthetic tax ${randomUUID()}`,
    address_line_1: `Fictional address ${randomUUID()}`, address_line_2: null, city: null,
    region: null, postal_code: null, country_code: null, notes: null, archived_at: null,
    created_at: timestamp, updated_at: timestamp,
  };
  await database.insertInto("businesses").values(business).execute();
  await database.insertInto("customers").values(customer).execute();
  const today = todayInTimeZone(business.timezone);
  const recurrenceId = randomUUID();
  await database.insertInto("recurring_invoices").values({
    id: recurrenceId, business_id: business.id, customer_id: customer.id, state: "active",
    frequency: "month", interval_count: 1, start_date: today, end_date: null,
    next_issue_date: today, next_occurrence_index: 2, payment_terms_days: 14,
    currency: business.currency, notes: null, payment_instructions: null,
    created_at: timestamp, updated_at: timestamp,
  }).execute();
  const invoiceId = randomUUID();
  const prepare = (currency = business.currency, rateMicros = 1_000_000) => aggregateModule.prepareInvoiceAggregate({
    id: invoiceId, business, customer, recurringInvoiceId: recurrenceId, recurrenceIndex: 1,
    invoiceNumber: `SYN-${randomUUID()}`, lifecycle, issueDate: today, dueDate: today, currency,
    exchangeRate: { base: currency, quote: business.currency, rateMicros, date: today, source: `Synthetic rate ${randomUUID()}` },
    notes: `Synthetic notes ${randomUUID()}`, paymentInstructions: business.payment_instructions,
    lines: [{ itemId: null, description: `Synthetic service ${randomUUID()}`, unit: "unit",
      quantityThousandths: randomInt(1, 5) * 1_000, unitPriceCents: randomInt(1_001, 90_000), taxRateBps: randomInt(1, 20) * 100 }],
    timestamp,
  }, randomUUID);
  await aggregateModule.insertInvoiceAggregate(database, prepare());
  const original = await database.selectFrom("invoices").selectAll()
    .where("id", "=", invoiceId).executeTakeFirstOrThrow();
  const originalLines = await database.selectFrom("invoice_lines").selectAll()
    .where("invoice_id", "=", invoiceId).orderBy("position").execute();
  const options = {
    expectedUpdatedAt: original.updated_at, confirmed: true, refreshCustomerDetails: false,
    actorName: `Fictional editor ${randomUUID()}`,
  };
  return { business, customer, original, originalLines, prepare, today, options };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function recordPayment(fixture: Fixture) {
  await database.insertInto("payments").values({
    id: randomUUID(), business_id: fixture.business.id, invoice_id: fixture.original.id,
    payment_date: fixture.today, amount_cents: fixture.original.total_cents, currency: fixture.original.currency,
    method: "bank_transfer", reference: `Synthetic receipt ${randomUUID()}`, notes: null,
    created_at: fixture.original.created_at, updated_at: fixture.original.updated_at,
  }).execute();
  return database.selectFrom("payments").selectAll()
    .where("invoice_id", "=", fixture.original.id).executeTakeFirstOrThrow();
}

async function state(fixture: Fixture) {
  const { business, original } = fixture;
  return {
    detail: await detailModule.getInvoiceDetail(business.id, original.id, fixture.today),
    revisions: await database.selectFrom("invoice_revisions").selectAll()
      .where("invoice_id", "=", original.id).orderBy("created_at").execute(),
    counter: await database.selectFrom("businesses").select("next_invoice_number")
      .where("id", "=", business.id).executeTakeFirstOrThrow(),
  };
}

describe("editing existing invoices", () => {
  it("edits a paid invoice, retains its identity and saves the prior receipt before reallocating currencies", async () => {
    const fixture = await createFixture();
    const { business, original, originalLines, options } = fixture;
    const receipt = await recordPayment(fixture);
    const changed = fixture.prepare("EUR", 800_000);
    changed.invoice.lifecycle = "draft";
    changed.invoice.recurring_invoice_id = null;
    changed.invoice.recurrence_index = null;
    await editModule.editInvoice(database, business, changed, options);
    const saved = await state(fixture);
    expect(saved.detail!.invoice).toMatchObject({
      id: original.id, invoice_number: original.invoice_number, lifecycle: "issued",
      recurring_invoice_id: original.recurring_invoice_id, recurrence_index: original.recurrence_index,
      created_at: original.created_at, currency: "EUR", total_cents: changed.invoice.total_cents,
    });
    expect(saved.detail!.lines).toEqual(changed.lines);
    expect(saved.detail!.invoice.updated_at).not.toBe(original.updated_at);
    expect(saved.counter.next_invoice_number).toBe(business.next_invoice_number);
    expect(saved.revisions).toHaveLength(1);
    expect(saved.revisions[0]).toMatchObject({ actor_name: options.actorName, invoice_number: original.invoice_number, total_cents: original.total_cents });
    const snapshot = JSON.parse(saved.revisions[0].snapshot) as InvoiceDetail;
    expect(snapshot).toMatchObject({ invoice: original, lines: originalLines, payments: [receipt], paidCents: receipt.amount_cents, balanceDueCents: 0, status: "paid" });
    const appliedAmount = Math.round(receipt.amount_cents * 1_000_000 / 800_000);
    expect(saved.detail!.paidCents).toBe(appliedAmount);
    expect(saved.detail!.payments[0]).toEqual({
      ...receipt, applied_amount_cents: appliedAmount, base_currency: original.base_currency,
      exchange_rate_micros: original.exchange_rate_micros, exchange_rate_date: original.exchange_rate_date,
      exchange_rate_source: original.exchange_rate_source,
    });

    await editModule.editInvoice(database, business, fixture.prepare(), {
      ...options, expectedUpdatedAt: saved.detail!.invoice.updated_at,
    });
    const returned = await state(fixture);
    expect(returned.detail!.payments[0]).toMatchObject({ id: receipt.id, currency: "GBP", amount_cents: receipt.amount_cents, applied_amount_cents: receipt.amount_cents });
    expect(returned.revisions).toHaveLength(2);
    expect(returned.revisions[0]).toEqual(saved.revisions[0]);
    expect(JSON.parse(returned.revisions[1].snapshot)).toMatchObject({ invoice: saved.detail!.invoice, payments: saved.detail!.payments });
  });

  it("edits a void invoice while retaining its status and previous version", async () => {
    const fixture = await createFixture("void");
    const before = await state(fixture);
    const changed = fixture.prepare("EUR", 800_000);
    await editModule.editInvoice(database, fixture.business, changed, {
      ...fixture.options, expectedUpdatedAt: before.detail!.invoice.updated_at,
    });
    const after = await state(fixture);
    expect(after.detail!.invoice).toMatchObject({ lifecycle: "void", currency: "EUR", total_cents: changed.invoice.total_cents });
    expect(after.detail!.balanceDueCents).toBe(0);
    expect(JSON.parse(after.revisions[0].snapshot)).toMatchObject({ invoice: before.detail!.invoice, status: "void" });
  });

  it("preserves published seller and customer snapshots unless customer details are explicitly refreshed", async () => {
    const fixture = await createFixture();
    const changed = fixture.prepare();
    changed.invoice.seller_name = `Fictional updated seller ${randomUUID()}`;
    changed.invoice.seller_email = `${randomUUID()}@example.invalid`;
    changed.invoice.seller_country_code = "DE";
    changed.invoice.invoice_footer = `Synthetic updated footer ${randomUUID()}`;
    changed.invoice.customer_name = `Fictional updated customer ${randomUUID()}`;
    changed.invoice.customer_email = `${randomUUID()}@example.invalid`;
    changed.invoice.customer_billing_name = `Synthetic billing name ${randomUUID()}`;
    changed.invoice.customer_country_code = "FR";
    await editModule.editInvoice(database, fixture.business, changed, fixture.options);
    const retained = await state(fixture);
    expect(retained.detail!.invoice).toMatchObject({
      seller_name: fixture.original.seller_name, seller_email: fixture.original.seller_email,
      invoice_footer: fixture.original.invoice_footer, customer_name: fixture.original.customer_name,
      customer_email: fixture.original.customer_email,
      seller_country_code: fixture.original.seller_country_code,
      customer_country_code: fixture.original.customer_country_code,
      customer_billing_name: fixture.original.customer_billing_name,
    });
    await editModule.editInvoice(database, fixture.business, changed, {
      ...fixture.options, expectedUpdatedAt: retained.detail!.invoice.updated_at, refreshCustomerDetails: true,
    });
    const refreshed = await state(fixture);
    expect(refreshed.detail!.invoice).toMatchObject({
      seller_name: fixture.original.seller_name, invoice_footer: fixture.original.invoice_footer,
      customer_name: changed.invoice.customer_name, customer_email: changed.invoice.customer_email,
      seller_country_code: fixture.original.seller_country_code,
      customer_country_code: changed.invoice.customer_country_code,
      customer_billing_name: changed.invoice.customer_billing_name,
    });
    expect(JSON.parse(refreshed.revisions[1].snapshot).invoice.customer_name).toBe(fixture.original.customer_name);
  });

  it("rejects missing acknowledgement, stale edits and cross-business access without partial changes", async () => {
    const fixture = await createFixture();
    const other = await createFixture();
    const before = await state(fixture);
    const otherBefore = await state(other);
    await expect(editModule.editInvoice(database, fixture.business, fixture.prepare(), {
      ...fixture.options, confirmed: false,
    })).rejects.toThrow("Acknowledge the warning");
    expect(await state(fixture)).toEqual(before);
    await expect(editModule.editInvoice(database, other.business, fixture.prepare(), fixture.options))
      .rejects.toThrow("changed or is unavailable");
    const forged = fixture.prepare();
    forged.invoice.business_id = other.business.id;
    await expect(editModule.editInvoice(database, fixture.business, forged, fixture.options))
      .rejects.toThrow("changed or is unavailable");
    expect(await state(fixture)).toEqual(before);
    expect(await state(other)).toEqual(otherBefore);
    await editModule.editInvoice(database, fixture.business, fixture.prepare(), fixture.options);
    const saved = await state(fixture);
    await expect(editModule.editInvoice(database, fixture.business, fixture.prepare(), fixture.options))
      .rejects.toThrow("changed or is unavailable");
    expect(await state(fixture)).toEqual(saved);
  });

  it("allows changing and clearing a published invoice's manual reporting rate", async () => {
    const fixture = await createFixture();
    await editModule.editInvoice(database, fixture.business, fixture.prepare("EUR", 800_000), fixture.options);
    const redirectSignal = new Error(`Synthetic redirect ${randomUUID()}`);
    vi.doMock("@/lib/session", () => ({
      requireBusiness: async () => fixture.business,
      requireSession: async () => ({ user: { name: fixture.options.actorName } }),
    }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    vi.doMock("next/navigation", () => ({ redirect: () => { throw redirectSignal; } }));
    vi.doMock("@/lib/exchange-rates", () => ({ getExchangeRate: async () => ({
      base: "EUR", quote: "GBP", rateMicros: 900_000, date: fixture.today, source: "Synthetic reference rate",
    }) }));
    try {
      const { updateInvoiceAction } = await import("./actions");
      for (const [rate, expectedRate] of [["0.7", 700_000], ["", 900_000]] as const) {
        const before = await state(fixture);
        const form = new FormData();
        for (const [key, value] of Object.entries({
          invoiceId: fixture.original.id, customerId: fixture.customer.id, currency: "EUR",
          issueDate: fixture.today, dueDate: fixture.today, exchangeRate: rate,
          expectedUpdatedAt: before.detail!.invoice.updated_at, publishedEditConfirmed: "on",
          lines: JSON.stringify([{ description: `Synthetic service ${randomUUID()}`, unit: "unit",
            quantity: "1", unitPrice: String(randomInt(10, 100)), taxRate: "0" }]),
        })) form.set(key, value);
        await expect(updateInvoiceAction({}, form)).rejects.toBe(redirectSignal);
        expect((await state(fixture)).detail!.invoice.exchange_rate_micros).toBe(expectedRate);
      }
    } finally {
      vi.doUnmock("@/lib/session");
      vi.doUnmock("next/cache");
      vi.doUnmock("next/navigation");
      vi.doUnmock("@/lib/exchange-rates");
    }
  });

  it("rolls back the invoice, receipt allocation and revision when replacement lines fail", async () => {
    const fixture = await createFixture();
    await recordPayment(fixture);
    const before = await state(fixture);
    const changed = fixture.prepare("EUR", 800_000);
    changed.lines[0].item_id = randomUUID();
    await expect(editModule.editInvoice(database, fixture.business, changed, fixture.options)).rejects.toThrow();
    expect(await state(fixture)).toEqual(before);
  });

  it("rejects a payment submitted in the old invoice currency after an edit", async () => {
    const fixture = await createFixture();
    const changed = fixture.prepare("EUR", 800_000);
    await editModule.editInvoice(database, fixture.business, changed, fixture.options);
    const before = await state(fixture);
    vi.doMock("@/lib/session", () => ({ requireBusiness: async () => fixture.business }));
    vi.doMock("next/cache", () => ({ revalidatePath: vi.fn() }));
    try {
      const { recordPaymentAction } = await import("@/features/payments/actions");
      const amountCents = randomInt(1, changed.invoice.total_cents);
      const form = new FormData();
      form.set("invoiceId", fixture.original.id);
      form.set("currency", fixture.original.currency);
      form.set("paymentDate", fixture.today);
      form.set("method", "bank_transfer");
      form.set("amount", (amountCents / 100).toFixed(2));
      expect(await recordPaymentAction({}, form)).toEqual({
        error: "The invoice currency has changed. Refresh the page before recording this payment.",
      });
      expect(await state(fixture)).toEqual(before);

      form.set("currency", "EUR");
      expect(await recordPaymentAction({}, form)).toEqual({ success: "Payment recorded" });
      const saved = await state(fixture);
      expect(saved.detail!.payments).toHaveLength(1);
      expect(saved.detail!.payments[0]).toMatchObject({
        currency: "EUR", amount_cents: amountCents, applied_amount_cents: amountCents,
        base_currency: "GBP", exchange_rate_micros: 800_000,
      });
      await editModule.editInvoice(database, fixture.business, fixture.prepare("USD", 600_000), {
        ...fixture.options, expectedUpdatedAt: saved.detail!.invoice.updated_at,
      });
      const { listPaymentsWithDatabase } = await import("@/features/payments/queries");
      const payments = await listPaymentsWithDatabase(database, fixture.business.id, 1, "GBP", fixture.today);
      expect(payments.summary).toMatchObject({ totalCents: Math.round(amountCents * 800_000 / 1_000_000), missingConversionCount: 0 });
    } finally {
      vi.doUnmock("@/lib/session");
      vi.doUnmock("next/cache");
    }
  });

  it("keeps ordinary draft editing free of published-invoice acknowledgement and revision history", async () => {
    const fixture = await createFixture("draft");
    const changed: PreparedInvoiceAggregate = fixture.prepare();
    changed.invoice.customer_name = `Fictional revised customer ${randomUUID()}`;
    await editModule.editInvoice(database, fixture.business, changed, { ...fixture.options, confirmed: false });
    const saved = await state(fixture);
    expect(saved.detail!.invoice).toMatchObject({ lifecycle: "draft", customer_name: changed.invoice.customer_name, total_cents: changed.invoice.total_cents });
    expect(saved.detail!.lines).toEqual(changed.lines);
    expect(saved.revisions).toEqual([]);
  });
});
