import "server-only";

import {
  insertInvoiceAggregate,
  prepareInvoiceAggregate,
  type InvoiceExchangeSnapshot,
} from "./aggregate";
import { FormSubmissionError, type SubmittedInvoice } from "./forms";
import { buildInvoiceSellerSnapshot } from "./seller-snapshot";
import { editInvoice } from "./edits";
import { db, newId, nowIso, type Business } from "@/lib/db";
import { allocateInvoiceNumber } from "@/lib/db/businesses";
import { getExchangeRate } from "@/lib/exchange-rates";
import { todayInTimeZone } from "@/lib/format";
import { addPaymentTerms, convertCents } from "@/lib/finance";

async function resolveDraftRelations(
  business: Business,
  input: SubmittedInvoice,
) {
  const customer = await db
    .selectFrom("customers")
    .selectAll()
    .where("business_id", "=", business.id)
    .where("id", "=", input.customerId)
    .executeTakeFirst();

  if (!customer) throw new FormSubmissionError("Choose a valid customer");

  const itemIds = [...new Set(input.lines.flatMap((line) => (line.itemId ? [line.itemId] : [])))];
  if (itemIds.length > 0) {
    const authorisedItems = await db
      .selectFrom("items")
      .select("id")
      .where("business_id", "=", business.id)
      .where("id", "in", itemIds)
      .execute();

    if (authorisedItems.length !== itemIds.length) {
      throw new FormSubmissionError("One or more saved items are unavailable");
    }
  }

  return customer;
}

async function exchangeSnapshot(business: Business, input: SubmittedInvoice) {
  if (input.exchangeRateMicros !== null) {
    if (
      input.currency === business.currency &&
      input.exchangeRateMicros !== 1_000_000
    ) {
      throw new FormSubmissionError(
        "The reporting exchange rate must be 1 for your business currency",
      );
    }
    return {
      base: input.currency,
      quote: business.currency,
      rateMicros: input.exchangeRateMicros,
      date: input.issueDate ?? todayInTimeZone(business.timezone),
      source: "Manual",
    };
  }

  try {
    return await getExchangeRate(
      input.currency,
      business.currency,
      input.issueDate ?? todayInTimeZone(business.timezone),
    );
  } catch {
    throw new FormSubmissionError(
      "The reference exchange rate is unavailable. Try saving again shortly.",
    );
  }
}

function prepareDraftAggregate({
  business,
  customer,
  exchangeRate,
  id,
  input,
  timestamp,
}: {
  business: Business;
  customer: Awaited<ReturnType<typeof resolveDraftRelations>>;
  exchangeRate: InvoiceExchangeSnapshot;
  id: string;
  input: SubmittedInvoice;
  timestamp: string;
}) {
  let aggregate;
  try {
    aggregate = prepareInvoiceAggregate(
      {
        id,
        business,
        customer,
        recurringInvoiceId: null,
        recurrenceIndex: null,
        invoiceNumber: null,
        lifecycle: "draft",
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        currency: input.currency,
        exchangeRate,
        notes: input.notes,
        paymentInstructions:
          input.paymentInstructions ?? business.payment_instructions,
        lines: input.lines,
        timestamp,
      },
      newId,
    );
  } catch (error) {
    if (error instanceof RangeError) {
      throw new FormSubmissionError("One or more line amounts are too large");
    }
    throw error;
  }

  try {
    convertCents(aggregate.invoice.total_cents, exchangeRate.rateMicros);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new FormSubmissionError(
        "The reporting exchange rate makes the invoice total too large",
      );
    }
    throw error;
  }
  return aggregate;
}

export async function previewInvoice(business: Business, input: SubmittedInvoice) {
  const [customer, exchangeRate] = await Promise.all([
    resolveDraftRelations(business, input),
    exchangeSnapshot(business, input),
  ]);
  return prepareDraftAggregate({ business, customer, exchangeRate, id: newId(), input, timestamp: nowIso() });
}

export async function createInvoice(business: Business, input: SubmittedInvoice) {
  const aggregate = await previewInvoice(business, input);
  await db.transaction().execute(async (transaction) => {
    await insertInvoiceAggregate(transaction, aggregate);
  });
  return aggregate.invoice.id;
}

export async function updateInvoice(
  business: Business,
  invoiceId: string,
  input: SubmittedInvoice,
  options: { expectedUpdatedAt: string; confirmed: boolean; refreshCustomerDetails: boolean; actorName: string },
) {
  const { expectedUpdatedAt, confirmed } = options;
  const original = await db.selectFrom("invoices").selectAll()
    .where("id", "=", invoiceId).where("business_id", "=", business.id)
    .executeTakeFirst();
  if (!original) throw new FormSubmissionError("This invoice is unavailable");
  if (original.lifecycle !== "draft" && !confirmed) {
    throw new FormSubmissionError("Acknowledge the warning before saving changes to a published invoice");
  }
  const unchangedRate = original.exchange_rate_source === "Manual"
    ? input.exchangeRateMicros === original.exchange_rate_micros
    : input.exchangeRateMicros === null;
  const preserveRate = original.lifecycle !== "draft" && unchangedRate && original.currency === input.currency &&
    original.issue_date === input.issueDate && original.base_currency === business.currency &&
    original.exchange_rate_micros && original.exchange_rate_date && original.exchange_rate_source;
  const [customer, exchangeRate] = await Promise.all([
    resolveDraftRelations(business, input),
    preserveRate ? Promise.resolve({
      base: original.currency, quote: business.currency,
      rateMicros: original.exchange_rate_micros!,
      date: original.exchange_rate_date!, source: original.exchange_rate_source!,
    }) : exchangeSnapshot(business, input),
  ]);
  const timestamp = nowIso();
  const aggregate = prepareDraftAggregate({
    business,
    customer,
    exchangeRate,
    id: invoiceId,
    input,
    timestamp,
  });

  aggregate.invoice.payment_instructions = input.paymentInstructions;
  await editInvoice(db, business, aggregate, {
    expectedUpdatedAt,
    confirmed,
    refreshCustomerDetails: options.refreshCustomerDetails,
    actorName: options.actorName,
  });
}

export async function updateDraftSeller(business: Business, invoiceId: string, expectedUpdatedAt?: string) {
  const original = await db.selectFrom("invoices").select("updated_at")
    .where("id", "=", invoiceId).where("business_id", "=", business.id)
    .where("lifecycle", "=", "draft").executeTakeFirst();
  if (!original || (expectedUpdatedAt && original.updated_at !== expectedUpdatedAt)) {
    throw new FormSubmissionError("The draft changed or is unavailable. Read it again before refreshing its seller details.");
  }
  const result = await db.updateTable("invoices")
    .set({
      ...buildInvoiceSellerSnapshot(business),
      updated_at: new Date(Math.max(Date.now(), Date.parse(original.updated_at) + 1)).toISOString(),
    })
    .where("id", "=", invoiceId)
    .where("business_id", "=", business.id)
    .where("lifecycle", "=", "draft")
    .where("updated_at", "=", original.updated_at)
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) !== 1) {
    throw new FormSubmissionError("The draft changed or is unavailable. Read it again before refreshing its seller details.");
  }
}

export async function issueInvoice(business: Business, invoiceId: string, expectedUpdatedAt?: string) {
  const invoice = await db
    .selectFrom("invoices")
    .select([
      "id",
      "lifecycle",
      "issue_date",
      "due_date",
      "currency",
      "base_currency",
      "exchange_rate_micros",
      "exchange_rate_date",
      "exchange_rate_source",
      "total_cents",
      "updated_at",
    ])
    .where("id", "=", invoiceId)
    .where("business_id", "=", business.id)
    .executeTakeFirst();

  if (!invoice || invoice.lifecycle !== "draft") {
    throw new FormSubmissionError("Only a draft can be issued");
  }

  if (expectedUpdatedAt && invoice.updated_at !== expectedUpdatedAt) {
    throw new FormSubmissionError("This invoice changed. Read it again before issuing.");
  }

  const issueDate = invoice.issue_date ?? todayInTimeZone(business.timezone);
  const dueDate =
    invoice.due_date ?? addPaymentTerms(issueDate, business.default_payment_terms_days);
  let exchangeRate: InvoiceExchangeSnapshot;
  if (invoice.exchange_rate_source === "Manual") {
    if (
      invoice.base_currency !== business.currency ||
      !invoice.exchange_rate_micros ||
      !invoice.exchange_rate_date
    ) {
      throw new FormSubmissionError(
        "Edit the draft to confirm its reporting exchange rate before issuing",
      );
    }
    exchangeRate = {
      base: invoice.currency,
      quote: invoice.base_currency,
      rateMicros: invoice.exchange_rate_micros,
      date: invoice.exchange_rate_date,
      source: invoice.exchange_rate_source,
    };
  } else {
    try {
      exchangeRate = await getExchangeRate(
        invoice.currency,
        business.currency,
        issueDate,
      );
    } catch {
      throw new FormSubmissionError(
        "The reference exchange rate is unavailable. Try issuing again shortly.",
      );
    }
  }

  try {
    convertCents(invoice.total_cents, exchangeRate.rateMicros);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new FormSubmissionError("The reporting exchange rate makes the invoice total too large");
    }
    throw error;
  }

  await db.transaction().execute(async (transaction) => {
    const invoiceNumber = await allocateInvoiceNumber(transaction, business.id);
    const result = await transaction
      .updateTable("invoices")
      .set({
        lifecycle: "issued",
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        due_date: dueDate,
        base_currency: business.currency,
        exchange_rate_micros: exchangeRate.rateMicros,
        exchange_rate_date: exchangeRate.date,
        exchange_rate_source: exchangeRate.source,
        updated_at: new Date(Math.max(Date.now(), Date.parse(invoice.updated_at) + 1)).toISOString(),
      })
      .where("id", "=", invoiceId)
      .where("business_id", "=", business.id)
      .where("lifecycle", "=", "draft")
      .where("updated_at", "=", invoice.updated_at)
      .executeTakeFirst();

    if (Number(result.numUpdatedRows) !== 1) {
      throw new FormSubmissionError("This invoice has already been issued");
    }
  });
}

export async function deleteDraftInvoice(business: Business, invoiceId: string, expectedUpdatedAt?: string) {
  let query = db.deleteFrom("invoices")
    .where("id", "=", invoiceId)
    .where("business_id", "=", business.id)
    .where("lifecycle", "=", "draft");
  if (expectedUpdatedAt) query = query.where("updated_at", "=", expectedUpdatedAt);
  const result = await query.executeTakeFirst();
  return Number(result.numDeletedRows) === 1;
}
