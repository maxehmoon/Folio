import { randomBytes, randomInt, randomUUID } from "node:crypto";

import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Business, Customer } from "@/lib/db/types";

import {
  insertInvoiceAggregate,
  prepareInvoiceAggregate,
  replaceDraftInvoiceAggregate,
} from "./aggregate";

const date = new Date(Date.UTC(2024, randomInt(0, 12), randomInt(1, 28)))
  .toISOString().slice(0, 10);
const timestamp = `${date}T12:00:00.000Z`;
const business: Business = {
  id: randomUUID(),
  owner_user_id: randomUUID(),
  name: `Fictional Seller ${randomUUID()}`,
  legal_name: null,
  email: `${randomUUID()}@example.invalid`,
  phone: null,
  tax_id: null,
  address_line_1: `${randomInt(1, 999)} Fictional-${randomUUID()} Way`,
  address_line_2: null,
  city: `Imaginary-${randomUUID()}`,
  region: "CA",
  postal_code: null,
  country_code: "CA",
  currency: "USD",
  timezone: "UTC",
  invoice_prefix: "SYN",
  next_invoice_number: 1,
  default_payment_terms_days: 0,
  payment_instructions: null,
  invoice_footer: null,
  logo_url: null,
  created_at: timestamp,
  updated_at: timestamp,
};
const customer: Customer = {
  id: randomUUID(),
  business_id: business.id,
  name: `Fictional Customer ${randomUUID()}`,
  avatar_data_url: null,
  default_currency: null,
  contact_name: null,
  email: null,
  phone: null,
  tax_id: null,
  address_line_1: `${randomInt(1, 999)} Fictional-${randomUUID()} Way`,
  address_line_2: null,
  city: `Imaginary-${randomUUID()}`,
  region: "CA",
  postal_code: null,
  country_code: "CA",
  notes: null,
  archived_at: null,
  created_at: timestamp,
  updated_at: timestamp,
};

let database: typeof import("@/lib/db");
let documents: typeof import("./document-query");

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ":memory:");
  vi.stubEnv("DATABASE_DIALECT", "sqlite");
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(32).toString("hex"));
  vi.stubEnv("FOLIO_PUBLIC_URL", "http://localhost:3000");
  vi.resetModules();
  database = await import("@/lib/db");
  await database.migrateDatabase();
  documents = await import("./document-query");
  await database.db.insertInto("auth_user").values({
    id: business.owner_user_id,
    name: `Fictional Owner ${randomUUID()}`,
    email: `${randomUUID()}@example.invalid`,
    email_verified: 1,
    image: null,
    created_at: timestamp,
    updated_at: timestamp,
  }).execute();
  await database.db.insertInto("businesses").values(business).execute();
  await database.db.insertInto("customers").values(customer).execute();
});

afterAll(async () => {
  await database?.closeDatabase();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function aggregateFor(countryCode: string | null, id: string = randomUUID()) {
  return prepareInvoiceAggregate({
    id,
    business: { ...business, country_code: countryCode },
    customer: { ...customer, country_code: countryCode },
    recurringInvoiceId: null,
    recurrenceIndex: null,
    invoiceNumber: null,
    lifecycle: "draft",
    issueDate: date,
    dueDate: null,
    currency: "USD",
    exchangeRate: { base: "USD", quote: "USD", rateMicros: 1_000_000, date, source: "synthetic" },
    notes: null,
    paymentInstructions: null,
    lines: [{
      itemId: null,
      description: `Fictional Service ${randomUUID()}`,
      unit: "",
      quantityThousandths: 1_000,
      unitPriceCents: randomInt(100, 10_000),
      taxRateBps: 0,
    }],
    timestamp,
  }, randomUUID);
}

describe("invoice country snapshots", () => {
  it.each([
    [null, null],
    ["CA", "Canada"],
    ["US", "United States"],
    ["GB", "United Kingdom"],
  ])("keeps state CA separate from country %s in stored and rendered invoices", async (code, name) => {
    const aggregate = aggregateFor(code);
    await insertInvoiceAggregate(database.db, aggregate);
    const stored = await database.db.selectFrom("invoices").selectAll()
      .where("id", "=", aggregate.invoice.id).executeTakeFirstOrThrow();
    expect(stored.seller_country_code).toBe(code);
    expect(stored.customer_country_code).toBe(code);
    expect(stored.seller_address).toBe(`${business.address_line_1}\n${business.city}\nCA`);
    expect(stored.customer_address).toBe(`${customer.address_line_1}\n${customer.city}\nCA`);

    const record = await documents.getInvoiceDocumentRecord(business, stored.id);
    expect(record?.data.seller.address).toEqual([
      business.address_line_1, business.city, "CA", ...(name ? [name] : []),
    ]);
    expect(record?.data.customer.address).toEqual([
      customer.address_line_1, customer.city, "CA", ...(name ? [name] : []),
    ]);
  });

  it("replaces and clears draft country snapshots together with their addresses", async () => {
    const aggregate = aggregateFor("CA");
    await insertInvoiceAggregate(database.db, aggregate);
    for (const [code, lastLine] of [["US", "United States"], [null, "CA"]]) {
      await database.db.transaction().execute((transaction) =>
        replaceDraftInvoiceAggregate(transaction, aggregateFor(code, aggregate.invoice.id)),
      );
      const record = await documents.getInvoiceDocumentRecord(business, aggregate.invoice.id);
      expect(record?.data.seller.address.at(-1)).toBe(lastLine);
      expect(record?.data.customer.address.at(-1)).toBe(lastLine);
      expect(record?.data.seller.address).not.toContain("Canada");
      expect(record?.data.customer.address).not.toContain("Canada");
    }
  });

  it("preserves issued country snapshots when current party details change", async () => {
    const aggregate = aggregateFor("CA");
    aggregate.invoice.lifecycle = "issued";
    aggregate.invoice.invoice_number = `SYN-${randomUUID()}`;
    await insertInvoiceAggregate(database.db, aggregate);
    await database.db.updateTable("businesses").set({ country_code: "US" })
      .where("id", "=", business.id).execute();
    await database.db.updateTable("customers").set({ country_code: "US" })
      .where("id", "=", customer.id).execute();
    const record = await documents.getInvoiceDocumentRecord(business, aggregate.invoice.id);
    expect(record?.data.seller.address.at(-1)).toBe("Canada");
    expect(record?.data.customer.address.at(-1)).toBe("Canada");
  });

  it("migrates legacy invoices without guessing countries or rewriting their addresses", async () => {
    const aggregate = aggregateFor(null);
    aggregate.invoice.seller_address = `${business.address_line_1}\nCA`;
    aggregate.invoice.customer_address = `${customer.address_line_1}\nGB`;
    await insertInvoiceAggregate(database.db, aggregate);
    await database.db.schema.alterTable("invoices").dropColumn("seller_country_code").execute();
    await database.db.schema.alterTable("invoices").dropColumn("customer_country_code").execute();
    await sql`delete from folio_migrations where name = '202609070001_invoice_country_snapshot'`
      .execute(database.db);

    await database.migrateDatabase();
    await database.migrateDatabase();
    const stored = await database.db.selectFrom("invoices").selectAll()
      .where("id", "=", aggregate.invoice.id).executeTakeFirstOrThrow();
    expect(stored.seller_country_code).toBeNull();
    expect(stored.customer_country_code).toBeNull();
    expect(stored.seller_address).toBe(aggregate.invoice.seller_address);
    expect(stored.customer_address).toBe(aggregate.invoice.customer_address);
    const record = await documents.getInvoiceDocumentRecord(business, stored.id);
    expect(record?.data.seller.address).toEqual([business.address_line_1, "CA"]);
    expect(record?.data.customer.address).toEqual([customer.address_line_1, "GB"]);
  });
});
