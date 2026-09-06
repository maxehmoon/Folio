import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Kysely } from "kysely";

import type { Database } from "@/lib/db/types";

type DatabaseModule = typeof import("@/lib/db");
type ServiceModule = typeof import("./service");

let databaseModule: DatabaseModule;
let serviceModule: ServiceModule;
let database: Kysely<Database>;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalDatabaseDialect = process.env.DATABASE_DIALECT;
const originalAuthSecret = process.env.APP_SECRET;

beforeAll(async () => {
  process.env.DATABASE_URL = ":memory:";
  process.env.DATABASE_DIALECT = "sqlite";
  process.env.APP_SECRET = "test-only-folio-secret-with-thirty-two-characters";
  databaseModule = await import("@/lib/db");
  await databaseModule.migrateDatabase();
  serviceModule = await import("./service");
  database = databaseModule.db;

  const timestamp = "2026-07-01T09:00:00.000Z";
  await database
    .insertInto("auth_user")
    .values({
      id: "owner-1",
      name: "Owner",
      email: "owner@example.com",
      email_verified: 1,
      image: null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
  await database
    .insertInto("businesses")
    .values({
      id: "business-1",
      owner_user_id: "owner-1",
      name: "Folio Studio",
      legal_name: "Folio Studio Ltd",
      email: "billing@example.com",
      phone: "+44 20 7946 0000",
      tax_id: "GB123",
      address_line_1: "1 Studio Way",
      address_line_2: null,
      city: "London",
      region: null,
      postal_code: "N1 1AA",
      country_code: "GB",
      currency: "GBP",
      timezone: "Europe/London",
      invoice_prefix: "FOL",
      next_invoice_number: 1,
      default_payment_terms_days: 14,
      payment_instructions: null,
      invoice_footer: "Registered in England and Wales.",
      logo_url: null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
  await database
    .insertInto("customers")
    .values({
      id: "customer-1",
      business_id: "business-1",
      name: "Northstar Design",
      contact_name: null,
      email: "accounts@northstar.example",
      phone: "+44 117 000 0000",
      tax_id: null,
      address_line_1: "2 Client Road",
      address_line_2: null,
      city: "Bristol",
      region: null,
      postal_code: "BS1 1AA",
      country_code: "GB",
      notes: null,
      archived_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
  await database
    .insertInto("recurring_invoices")
    .values({
      id: "recurring-1",
      business_id: "business-1",
      customer_id: "customer-1",
      state: "active",
      frequency: "month",
      interval_count: 1,
      start_date: "2026-07-31",
      end_date: null,
      next_issue_date: "2026-07-31",
      next_occurrence_index: 0,
      payment_terms_days: 14,
      currency: "GBP",
      notes: "Retainer",
      payment_instructions: "Bank transfer",
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
  await database
    .insertInto("recurring_invoice_lines")
    .values({
      id: "recurring-line-1",
      business_id: "business-1",
      recurring_invoice_id: "recurring-1",
      item_id: null,
      position: 0,
      description: "Monthly design retainer",
      unit: "month",
      quantity_thousandths: 1_000,
      unit_price_cents: 2_500,
      tax_rate_bps: 2_000,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
});

afterAll(async () => {
  if (databaseModule) await databaseModule.closeDatabase();
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalDatabaseDialect === undefined) delete process.env.DATABASE_DIALECT;
  else process.env.DATABASE_DIALECT = originalDatabaseDialect;
  if (originalAuthSecret === undefined) delete process.env.APP_SECRET;
  else process.env.APP_SECRET = originalAuthSecret;
});

describe("runRecurringTick", () => {
  it("creates one snapshot invoice and remains idempotent when rerun", async () => {
    const first = await serviceModule.runRecurringTickWithDatabase(
      database,
      "2026-07-31",
      "business-1",
    );
    expect(first).toMatchObject({ due: 1, generated: 1, skipped: 0, failed: 0 });

    const invoice = await database
      .selectFrom("invoices")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(invoice).toMatchObject({
      invoice_number: "FOL-000001",
      lifecycle: "issued",
      issue_date: "2026-07-31",
      due_date: "2026-08-14",
      base_currency: "GBP",
      exchange_rate_micros: 1_000_000,
      exchange_rate_date: "2026-07-31",
      exchange_rate_source: "Identity",
      seller_name: "Folio Studio Ltd",
      seller_phone: "+44 20 7946 0000",
      customer_name: "Northstar Design",
      customer_phone: "+44 117 000 0000",
      invoice_footer: "Registered in England and Wales.",
      subtotal_cents: 2_500,
      tax_cents: 500,
      total_cents: 3_000,
      recurring_invoice_id: "recurring-1",
      recurrence_index: 0,
    });

    const schedule = await database
      .selectFrom("recurring_invoices")
      .select(["next_issue_date", "next_occurrence_index"])
      .where("id", "=", "recurring-1")
      .executeTakeFirstOrThrow();
    expect(schedule).toEqual({
      next_issue_date: "2026-08-31",
      next_occurrence_index: 1,
    });

    const second = await serviceModule.runRecurringTickWithDatabase(
      database,
      "2026-07-31",
      "business-1",
    );
    expect(second).toMatchObject({ due: 0, generated: 0, failed: 0 });
    expect(
      await database.selectFrom("invoices").select("id").execute(),
    ).toHaveLength(1);
    expect(
      await database.selectFrom("recurring_runs").select("id").execute(),
    ).toHaveLength(1);

    // Simulate a stale scheduler pointer after an already-completed run. The
    // occurrence guard must prevent another invoice and repair the pointer.
    await database
      .updateTable("recurring_invoices")
      .set({ next_issue_date: "2026-07-31", next_occurrence_index: 0 })
      .where("id", "=", "recurring-1")
      .execute();
    const guarded = await serviceModule.runRecurringTickWithDatabase(
      database,
      "2026-07-31",
      "business-1",
    );
    expect(guarded).toMatchObject({ due: 1, generated: 0, skipped: 1, failed: 0 });
    expect(
      await database.selectFrom("invoices").select("id").execute(),
    ).toHaveLength(1);
    expect(
      await database
        .selectFrom("recurring_invoices")
        .select(["next_issue_date", "next_occurrence_index"])
        .where("id", "=", "recurring-1")
        .executeTakeFirstOrThrow(),
    ).toEqual({ next_issue_date: "2026-08-31", next_occurrence_index: 1 });

    const timestamp = "2026-07-01T09:00:00.000Z";
    await database
      .insertInto("recurring_invoices")
      .values({
        id: "recurring-catch-up",
        business_id: "business-1",
        customer_id: "customer-1",
        state: "active",
        frequency: "day",
        interval_count: 1,
        start_date: "2026-07-01",
        end_date: "2026-07-03",
        next_issue_date: "2026-07-01",
        next_occurrence_index: 0,
        payment_terms_days: 14,
        currency: "GBP",
        notes: null,
        payment_instructions: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await database
      .insertInto("recurring_invoice_lines")
      .values({
        id: "recurring-catch-up-line",
        business_id: "business-1",
        recurring_invoice_id: "recurring-catch-up",
        item_id: null,
        position: 0,
        description: "Daily support",
        unit: "day",
        quantity_thousandths: 1_000,
        unit_price_cents: 1_000,
        tax_rate_bps: 0,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();

    const catchUp = await serviceModule.runRecurringTickWithDatabase(
      database,
      "2026-07-03",
      "business-1",
    );
    expect(catchUp).toMatchObject({
      due: 1,
      generated: 3,
      skipped: 0,
      failed: 0,
      capped: 0,
    });
    expect(
      await database
        .selectFrom("invoices")
        .select("id")
        .where("recurring_invoice_id", "=", "recurring-catch-up")
        .execute(),
    ).toHaveLength(3);
    expect(
      await database
        .selectFrom("recurring_invoices")
        .select("state")
        .where("id", "=", "recurring-catch-up")
        .executeTakeFirstOrThrow(),
    ).toEqual({ state: "ended" });

    await database
      .updateTable("businesses")
      .set({ timezone: "Pacific/Kiritimati" })
      .where("id", "=", "business-1")
      .execute();
    await database
      .insertInto("recurring_invoices")
      .values({
        id: "recurring-timezone",
        business_id: "business-1",
        customer_id: "customer-1",
        state: "active",
        frequency: "month",
        interval_count: 1,
        start_date: "2026-08-01",
        end_date: null,
        next_issue_date: "2026-08-01",
        next_occurrence_index: 0,
        payment_terms_days: 14,
        currency: "GBP",
        notes: null,
        payment_instructions: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    await database
      .insertInto("recurring_invoice_lines")
      .values({
        id: "recurring-timezone-line",
        business_id: "business-1",
        recurring_invoice_id: "recurring-timezone",
        item_id: null,
        position: 0,
        description: "Timezone retainer",
        unit: "month",
        quantity_thousandths: 1_000,
        unit_price_cents: 1_000,
        tax_rate_bps: 0,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();

    const localTick = await serviceModule.runRecurringTicksAtWithDatabase(
      database,
      new Date("2026-07-31T10:30:00.000Z"),
    );
    expect(localTick).toMatchObject({ businesses: 1, due: 1, generated: 1 });
    expect(
      await database
        .selectFrom("invoices")
        .select("issue_date")
        .where("recurring_invoice_id", "=", "recurring-timezone")
        .executeTakeFirstOrThrow(),
    ).toEqual({ issue_date: "2026-08-01" });

    await database
      .insertInto("recurring_invoices")
      .values({
        id: "recurring-failure",
        business_id: "business-1",
        customer_id: "customer-1",
        state: "active",
        frequency: "month",
        interval_count: 1,
        start_date: "2026-08-01",
        end_date: null,
        next_issue_date: "2026-08-01",
        next_occurrence_index: 0,
        payment_terms_days: 14,
        currency: "GBP",
        notes: null,
        payment_instructions: null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .execute();
    const failed = await serviceModule.runRecurringTickWithDatabase(
      database,
      "2026-08-01",
      "business-1",
    );
    expect(failed).toMatchObject({ due: 1, generated: 0, failed: 1 });
    expect(
      await database
        .selectFrom("recurring_runs")
        .select(["status", "error_message"])
        .where("recurring_invoice_id", "=", "recurring-failure")
        .executeTakeFirstOrThrow(),
    ).toMatchObject({
      status: "failed",
      error_message: "The recurring invoice has no line items",
    });
  });
});
