import { loadScriptEnvironment } from "./environment";

import {
  db,
  migrateDatabase,
  newId,
  nowIso,
  type Business,
  type Customer,
} from "@/lib/db";
import { getOwnerIdentity } from "@/lib/setup/owner-bootstrap";
import { getBusinessByOwnerId } from "@/lib/db/businesses";
import {
  insertInvoiceAggregate,
  prepareInvoiceAggregate,
} from "@/features/invoices/aggregate";

const DEMO_PREFIX = "demo-";
const TODAY = "2026-08-17";

function demoId(type: string, index: number): string {
  return `${DEMO_PREFIX}${type}-${index.toString().padStart(3, "0")}`;
}

function dateForMonth(offset: number, day: number): string {
  const date = new Date(Date.UTC(2025, 8 + offset, day));
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function amountForCustomer(index: number): number {
  return 85000 + (index % 6) * 27500;
}

async function clearDemoData(executor: typeof db): Promise<void> {
  for (const table of ["payments", "invoice_lines", "invoices", "recurring_runs", "recurring_invoice_lines", "recurring_invoices", "expenses", "items", "customers"] as const) {
    await executor.deleteFrom(table).where("id", "like", `${DEMO_PREFIX}%`).execute();
  }
}

function customerRows(business: Business, timestamp: string) {
  const names = [
    ["Northstar Studio", "Ava Morgan"],
    ["Cedar & Finch", "Oliver Bennett"],
    ["Marlow Digital", "Sofia Hughes"],
    ["Brightline Events", "Noah Williams"],
    ["Harbour Works", "Isla Thompson"],
    ["Juniper Health", "Arthur Davies"],
    ["Redwood Advisory", "Emily Wilson"],
    ["Lumen Architecture", "George Evans"],
    ["Orbit Learning", "Mia Thomas"],
    ["Tideway Foods", "Leo Roberts"],
    ["Kindred Commerce", "Grace Johnson"],
    ["Atlas Research", "Freddie Lewis"],
    ["Meadow & Co", "Ella Walker"],
    ["Union House", "Henry Robinson"],
    ["Pine & Pixel", "Poppy Wright"],
    ["Westfield Legal", "Charlie Green"],
    ["Oakwell Finance", "Sienna Hall"],
    ["Silver Birch", "Jack Thomas"],
    ["Fieldnote Media", "Evie Clarke"],
    ["Common Ground", "Theo Jackson"],
    ["Bluebell Retail", "Lily White"],
    ["Foundry Labs", "Oscar Harris"],
    ["Elm Street Design", "Isabel Martin"],
    ["Meridian Travel", "Archie Cooper"],
  ];

  return names.map(([name, contactName], index) => ({
    id: demoId("customer", index + 1),
    business_id: business.id,
    name,
    avatar_data_url: null,
    default_currency: index % 5 === 0 ? "USD" : "GBP",
    contact_name: contactName,
    email: `${contactName.toLowerCase().replaceAll(" ", ".")}@${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "")}.example`,
    phone: `+44 20 7946 ${String(1000 + index).slice(-4)}`,
    tax_id: index % 4 === 0 ? `GB${String(100000000 + index)}` : null,
    address_line_1: `${index + 1} ${["King Street", "Station Road", "Market Lane", "Church Street"][index % 4]}`,
    address_line_2: index % 3 === 0 ? `Suite ${index + 2}` : null,
    city: ["London", "Manchester", "Bristol", "Edinburgh"][index % 4],
    region: ["England", "England", "England", "Scotland"][index % 4],
    postal_code: `${["EC1", "M1", "BS1", "EH1"][index % 4]} ${index + 1}AB`,
    country_code: "GB",
    notes: null,
    archived_at: index === 23 ? timestamp : null,
    created_at: dateForMonth(-12 + (index % 10), 8),
    updated_at: timestamp,
  }));
}

function itemRows(business: Business, timestamp: string) {
  const items = [
    ["Strategy retainer", "Monthly strategic support", 240000, 2000],
    ["Design sprint", "Five-day product design sprint", 480000, 2000],
    ["Development day", "Full-stack engineering day", 95000, 2000],
    ["Copywriting package", "Website and campaign copy", 180000, 2000],
    ["Research workshop", "Half-day customer research workshop", 220000, 2000],
    ["Analytics setup", "Tracking and reporting setup", 125000, 2000],
    ["Support hours", "Ad hoc support and maintenance", 8500, 2000],
    ["Travel expenses", "Reimbursable travel and accommodation", 0, 0],
    ["Training session", "Remote team training session", 75000, 0],
    ["Hosting and tooling", "Managed hosting and software costs", 45000, 2000],
    ["Brand workshop", "Brand positioning and identity workshop", 300000, 2000],
    ["One-off line", "Flexible invoice line", 10000, 0],
  ] as const;

  return items.map(([name, description, unitPriceCents, taxRateBps], index) => ({
    id: demoId("item", index + 1),
    business_id: business.id,
    name,
    description,
    unit: name === "Support hours" ? "hour" : "service",
    unit_price_cents: unitPriceCents,
    tax_rate_bps: taxRateBps,
    currency: "GBP",
    archived_at: index === 11 ? timestamp : null,
    created_at: dateForMonth(-10 + (index % 8), 4),
    updated_at: timestamp,
  }));
}

async function seedDemoData(business: Business, customers: Customer[], timestamp: string): Promise<void> {
  const items = itemRows(business, timestamp);
  await db.insertInto("customers").values(customerRows(business, timestamp)).execute();
  await db.insertInto("items").values(items).execute();

  const recurringDefinitions = Array.from({ length: 6 }, (_, index) => ({
    id: demoId("recurring", index + 1),
    business_id: business.id,
    customer_id: customers[index].id,
    state: index === 5 ? "paused" as const : "active" as const,
    frequency: index % 2 === 0 ? "month" as const : "year" as const,
    interval_count: 1,
    start_date: dateForMonth(-8 + index, 1),
    end_date: null,
    next_issue_date: dateForMonth(1 + index, 1),
    next_occurrence_index: index + 3,
    payment_terms_days: 14,
    currency: "GBP",
    notes: index === 0 ? "Monthly retainer for ongoing strategy support." : null,
    payment_instructions: business.payment_instructions,
    created_at: dateForMonth(-8 + index, 1),
    updated_at: timestamp,
  }));
  await db.insertInto("recurring_invoices").values(recurringDefinitions).execute();
  await db.insertInto("recurring_invoice_lines").values(
    recurringDefinitions.map((recurring, index) => ({
      id: demoId("recurring-line", index + 1),
      business_id: business.id,
      recurring_invoice_id: recurring.id,
      item_id: items[index].id,
      position: 0,
      description: items[index].name,
      unit: items[index].unit,
      quantity_thousandths: 1000,
      unit_price_cents: amountForCustomer(index),
      tax_rate_bps: 2000,
      created_at: recurring.created_at,
      updated_at: timestamp,
    })),
  ).execute();

  for (let index = 0; index < 36; index += 1) {
    const customer = customers[index % customers.length];
    const lifecycle = index % 11 === 5 ? "draft" as const : index % 13 === 7 ? "void" as const : "issued" as const;
    const issueDate = lifecycle === "draft" ? null : dateForMonth(-11 + (index % 12), 15);
    const dueDate = issueDate ? addDays(issueDate, index % 4 === 0 ? 14 : 30) : null;
    const currency = index % 5 === 0 ? "USD" : "GBP";
    const exchangeRate = currency === "GBP" ? 1_000_000 : 790_000;
    const recurringIndex = index < 6 ? index : null;
    const recurringInvoiceId = recurringIndex === null ? null : recurringDefinitions[recurringIndex].id;
    const lines = [
      {
        itemId: items[index % items.length].id,
        description: items[index % items.length].name,
        unit: items[index % items.length].unit,
        quantityThousandths: 1000 + (index % 3) * 500,
        unitPriceCents: amountForCustomer(index % 6),
        taxRateBps: index % 4 === 0 ? 0 : 2000,
      },
      ...(index % 3 === 0 ? [{
        itemId: items[(index + 2) % items.length].id,
        description: items[(index + 2) % items.length].name,
        unit: items[(index + 2) % items.length].unit,
        quantityThousandths: 1000,
        unitPriceCents: 45000 + (index % 4) * 5000,
        taxRateBps: 2000,
      }] : []),
    ];
    const aggregate = prepareInvoiceAggregate(
      {
        id: demoId("invoice", index + 1),
        business,
        customer,
        recurringInvoiceId,
        recurrenceIndex: recurringIndex,
        invoiceNumber: `${business.invoice_prefix}-DEMO-${String(index + 1).padStart(4, "0")}`,
        lifecycle,
        issueDate,
        dueDate,
        currency,
        exchangeRate: {
          base: currency,
          quote: business.currency,
          rateMicros: exchangeRate,
          date: issueDate ?? TODAY,
          source: "demo-data",
        },
        notes: null,
        paymentInstructions: business.payment_instructions,
        lines,
        timestamp: issueDate ? `${issueDate}T09:00:00.000Z` : timestamp,
      },
      () => newId(),
    );
    await insertInvoiceAggregate(db, aggregate);

    if (lifecycle !== "issued") continue;
    const paymentState = index % 6;
    const paymentAmount = paymentState === 0 || paymentState === 4
      ? aggregate.invoice.total_cents
      : paymentState === 1
        ? Math.max(1, Math.floor(aggregate.invoice.total_cents * 0.45))
        : 0;
    if (paymentAmount > 0) {
      await db.insertInto("payments").values({
        id: demoId("payment", index + 1),
        business_id: business.id,
        invoice_id: aggregate.invoice.id,
        payment_date: addDays(issueDate!, paymentState === 1 ? 12 : 8),
        amount_cents: paymentAmount,
        currency,
        method: paymentState === 4 ? "card" : "bank_transfer",
        reference: `DEMO-RECEIPT-${String(index + 1).padStart(4, "0")}`,
        notes: null,
        created_at: timestamp,
        updated_at: timestamp,
      }).execute();
    }
  }

  const expenseVendors = ["Google Workspace", "AWS", "Adobe", "Railcard", "WeWork", "Office Depot", "Figma", "HMRC"];
  const expenseCategories = ["Software", "Hosting", "Travel", "Office", "Professional services"];
  await db.insertInto("expenses").values(
    Array.from({ length: 32 }, (_, index) => {
      const subtotal = 1800 + (index % 9) * 12750;
      const tax = index % 4 === 0 ? 0 : Math.round(subtotal * 0.2);
      const expenseDate = dateForMonth(-11 + (index % 12), 3 + (index % 20));
      return {
        id: demoId("expense", index + 1),
        business_id: business.id,
        vendor: expenseVendors[index % expenseVendors.length],
        category: expenseCategories[index % expenseCategories.length],
        description: null,
        expense_date: expenseDate,
        currency: index % 7 === 0 ? "USD" : "GBP",
        subtotal_cents: subtotal,
        tax_cents: tax,
        total_cents: subtotal + tax,
        reference: `EXP-DEMO-${String(index + 1).padStart(4, "0")}`,
        notes: null,
        receipt_url: null,
        receipt_data_url: null,
        created_at: `${expenseDate}T10:00:00.000Z`,
        updated_at: timestamp,
      };
    }),
  ).execute();
}

async function main(): Promise<void> {
  await loadScriptEnvironment();
  await migrateDatabase();

  try {
    const owner = await getOwnerIdentity();
    if (!owner) throw new Error("Create the owner account before loading demo data.");
    const business = await getBusinessByOwnerId(owner.id);
    if (!business) throw new Error("Complete organisation setup before loading demo data.");

    const timestamp = nowIso();
    await clearDemoData(db);
    const customers = customerRows(business, timestamp);
    await seedDemoData(business, customers as Customer[], timestamp);
    await db.updateTable("businesses").set({ next_invoice_number: 100, updated_at: timestamp }).where("id", "=", business.id).execute();

    const counts = await Promise.all([
      db.selectFrom("customers").select(({ fn }) => fn.countAll<number>().as("count")).where("business_id", "=", business.id).executeTakeFirstOrThrow(),
      db.selectFrom("items").select(({ fn }) => fn.countAll<number>().as("count")).where("business_id", "=", business.id).executeTakeFirstOrThrow(),
      db.selectFrom("invoices").select(({ fn }) => fn.countAll<number>().as("count")).where("business_id", "=", business.id).executeTakeFirstOrThrow(),
      db.selectFrom("payments").select(({ fn }) => fn.countAll<number>().as("count")).where("business_id", "=", business.id).executeTakeFirstOrThrow(),
      db.selectFrom("expenses").select(({ fn }) => fn.countAll<number>().as("count")).where("business_id", "=", business.id).executeTakeFirstOrThrow(),
    ]);
    const [customersCount, itemsCount, invoicesCount, paymentsCount, expensesCount] = counts;
    console.info(
      `Loaded demo data: ${customersCount.count} customers, ${itemsCount.count} items, ${invoicesCount.count} invoices, ${paymentsCount.count} payments, ${expensesCount.count} expenses.`,
    );
  } finally {
    const { closeDatabase } = await import("@/lib/db");
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
