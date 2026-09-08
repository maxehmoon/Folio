import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Kysely } from "kysely";

import type { Database } from "@/lib/db/types";

type DatabaseModule = typeof import("@/lib/db");
type DashboardModule = typeof import("@/features/dashboard/queries");
type LedgerModule = typeof import("./ledger");
type PaymentModule = typeof import("@/features/payments/queries");
type SearchModule = typeof import("@/features/search/queries");
type CsvModule = typeof import("@/features/reports/csv");

let databaseModule: DatabaseModule;
let dashboardModule: DashboardModule;
let ledgerModule: LedgerModule;
let paymentModule: PaymentModule;
let searchModule: SearchModule;
let csvModule: CsvModule;
let database: Kysely<Database>;

const timestamp = "2026-07-01T09:00:00.000Z";

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv(
    "APP_SECRET",
    "test-only-folio-secret-with-thirty-two-characters",
  );
  vi.resetModules();

  databaseModule = await import("@/lib/db");
  await databaseModule.migrateDatabase();
  [dashboardModule, ledgerModule, paymentModule, searchModule, csvModule] =
    await Promise.all([
      import("@/features/dashboard/queries"),
      import("./ledger"),
      import("@/features/payments/queries"),
      import("@/features/search/queries"),
      import("@/features/reports/csv"),
    ]);
  database = databaseModule.db;

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
      legal_name: null,
      email: "billing@example.com",
      phone: null,
      tax_id: null,
      address_line_1: null,
      address_line_2: null,
      city: null,
      region: null,
      postal_code: null,
      country_code: "GB",
      currency: "GBP",
      timezone: "Europe/London",
      invoice_prefix: "INV",
      next_invoice_number: 4,
      default_payment_terms_days: 30,
      payment_instructions: null,
      invoice_footer: null,
      logo_url: null,
      created_at: timestamp,
      updated_at: timestamp,
    })
    .execute();
  await database
    .insertInto("customers")
    .values([
      {
        id: "customer-literal",
        business_id: "business-1",
        name: "50%_! Studio",
        contact_name: null,
        email: null,
        phone: null,
        tax_id: null,
        address_line_1: null,
        address_line_2: null,
        city: null,
        region: null,
        postal_code: null,
        country_code: null,
        notes: null,
        archived_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: "customer-wildcard-decoy",
        business_id: "business-1",
        name: "50abcZ! Studio",
        contact_name: null,
        email: null,
        phone: null,
        tax_id: null,
        address_line_1: null,
        address_line_2: null,
        city: null,
        region: null,
        postal_code: null,
        country_code: null,
        notes: null,
        archived_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ])
    .execute();

  const invoiceDefaults = {
    business_id: "business-1",
    customer_id: "customer-literal",
    recurring_invoice_id: null,
    recurrence_index: null,
    lifecycle: "issued" as const,
    due_date: "2026-08-01",
    seller_name: "Folio Studio",
    seller_email: "billing@example.com",
    seller_tax_id: null,
    seller_address: null,
    customer_email: null,
    customer_tax_id: null,
    customer_address: null,
    notes: null,
    payment_instructions: null,
    subtotal_cents: 10_000,
    tax_cents: 0,
    total_cents: 10_000,
    created_at: timestamp,
    updated_at: timestamp,
  };
  await database
    .insertInto("invoices")
    .values([
      {
        ...invoiceDefaults,
        id: "invoice-base",
        invoice_number: "INV-1",
        issue_date: "2026-07-01",
        currency: "GBP",
        base_currency: "GBP",
        exchange_rate_micros: null,
        exchange_rate_date: null,
        exchange_rate_source: null,
        customer_name: "Base Client",
      },
      {
        ...invoiceDefaults,
        id: "invoice-fx",
        invoice_number: "INV-2",
        issue_date: "2026-07-02",
        currency: "USD",
        base_currency: "GBP",
        exchange_rate_micros: 800_000,
        exchange_rate_date: "2026-07-02",
        exchange_rate_source: "Test rate",
        customer_name: "FX Client",
      },
      {
        ...invoiceDefaults,
        id: "invoice-missing-fx",
        invoice_number: "INV-3",
        issue_date: "2026-07-03",
        currency: "EUR",
        base_currency: null,
        exchange_rate_micros: null,
        exchange_rate_date: null,
        exchange_rate_source: null,
        customer_name: "Missing FX",
      },
    ])
    .execute();
  await database
    .insertInto("payments")
    .values([
      {
        id: "payment-base",
        business_id: "business-1",
        invoice_id: "invoice-base",
        payment_date: "2026-07-02",
        amount_cents: 5_000,
        currency: "GBP",
        method: "bank_transfer",
        reference: null,
        notes: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: "payment-fx",
        business_id: "business-1",
        invoice_id: "invoice-fx",
        payment_date: "2026-07-01",
        amount_cents: 5_000,
        currency: "USD",
        method: "card",
        reference: null,
        notes: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: "payment-before-window",
        business_id: "business-1",
        invoice_id: "invoice-base",
        payment_date: "2026-06-30",
        amount_cents: 1_000,
        currency: "GBP",
        method: "cash",
        reference: null,
        notes: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ])
    .execute();
  await database
    .insertInto("expenses")
    .values([
      {
        id: "expense-base",
        business_id: "business-1",
        vendor: "Base vendor",
        category: "Software",
        description: null,
        expense_date: "2026-07-03",
        currency: "GBP",
        subtotal_cents: 3_000,
        tax_cents: 0,
        total_cents: 3_000,
        reference: null,
        notes: null,
        receipt_url: null,
        receipt_data_url: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: "expense-missing-fx",
        business_id: "business-1",
        vendor: "Foreign vendor",
        category: "Travel",
        description: null,
        expense_date: "2026-07-04",
        currency: "USD",
        subtotal_cents: 2_000,
        tax_cents: 0,
        total_cents: 2_000,
        reference: null,
        notes: null,
        receipt_url: null,
        receipt_data_url: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ])
    .execute();
});

afterAll(async () => {
  await databaseModule?.closeDatabase();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("canonical financial entries", () => {
  it("keeps report totals, dashboard chart data, and CSV conversions aligned", async () => {
    const entries = await ledgerModule.loadFinancialEntriesWithDatabase(
      database,
      {
        businessId: "business-1",
        baseCurrency: "GBP",
        range: { from: "2026-07-01", to: "2026-07-31" },
      },
    );
    const summary = ledgerModule.summariseFinancialEntries(entries);
    expect(summary).toEqual({
      salesCents: 18_000,
      receiptsCents: 9_000,
      expensesCents: 3_000,
      netIncomeCents: 6_000,
      missingConversionCount: 2,
    });

    const series = await dashboardModule.getFinancialSeries(
      "business-1",
      "GBP",
      "2026-07-31",
    );
    expect(series.points.at(-1)).toMatchObject({
      key: "2026-07",
      salesCents: summary.salesCents,
      receiptsCents: summary.receiptsCents,
      expensesCents: summary.expensesCents,
    });
    expect(series.missingConversionCount).toBe(
      summary.missingConversionCount,
    );

    const csv = csvModule.renderFinancialEntriesCsv(entries, "GBP");
    expect(csv).toContain(
      '"Sale","2026-07-02","INV-2","FX Client","Invoice issued","100.00","USD","80.00","GBP","2026-07-02","Test rate"',
    );
    expect(csv).toContain(
      '"Sale","2026-07-03","INV-3","Missing FX","Invoice issued","100.00","EUR","","GBP","",""',
    );
  });

  it("uses the supplied business-local date for the inclusive 30-day window", async () => {
    const result = await paymentModule.listPaymentsWithDatabase(
      database,
      "business-1",
      1,
      "GBP",
      "2026-07-30",
    );
    expect(result.summary).toEqual({
      recentCents: 9_000,
      totalCents: 10_000,
      missingConversionCount: 0,
    });
  });

  it("treats LIKE metacharacters as literal search text", async () => {
    const groups = await searchModule.searchFolioWithDatabase(
      database,
      "business-1",
      "50%_!",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.results.map((result) => result.id)).toEqual([
      "customer-literal",
    ]);
  });
});
