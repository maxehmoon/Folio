"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  InvoiceAggregateConflictError,
  insertInvoiceAggregate,
  prepareInvoiceAggregate,
  replaceDraftInvoiceAggregate,
  type InvoiceExchangeSnapshot,
} from "@/features/invoices/aggregate";
import {
  FormSubmissionError,
  parseInvoiceFormData,
  type InvoiceActionState,
  type SubmittedInvoice,
} from "@/features/invoices/forms";
import { buildInvoiceSellerSnapshot } from "@/features/invoices/seller-snapshot";
import { db, newId, nowIso, type Business } from "@/lib/db";
import { allocateInvoiceNumber } from "@/lib/db/businesses";
import { getExchangeRate } from "@/lib/exchange-rates";
import { todayInTimeZone } from "@/lib/format";
import { addPaymentTerms } from "@/lib/finance";
import { requireBusiness } from "@/lib/session";

function readId(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim() || value.length > 100) {
    throw new FormSubmissionError("The invoice could not be identified");
  }
  return value;
}

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

function actionError(error: unknown): InvoiceActionState {
  if (error instanceof FormSubmissionError) return { error: error.message };
  if (error instanceof InvoiceAggregateConflictError) return { error: error.message };
  throw error;
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
  try {
    return prepareInvoiceAggregate(
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
}

export async function createInvoiceAction(
  _state: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const business = await requireBusiness();
  let invoiceId: string;

  try {
    const input = parseInvoiceFormData(formData);
    const [customer, exchangeRate] = await Promise.all([
      resolveDraftRelations(business, input),
      exchangeSnapshot(business, input),
    ]);
    invoiceId = newId();
    const timestamp = nowIso();
    const aggregate = prepareDraftAggregate({
      business,
      customer,
      exchangeRate,
      id: invoiceId,
      input,
      timestamp,
    });

    await db.transaction().execute(async (transaction) => {
      await insertInvoiceAggregate(transaction, aggregate);
    });
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/invoices");
  revalidatePath("/");
  redirect(`/invoices/${invoiceId}`);
}

export async function updateInvoiceAction(
  _state: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const business = await requireBusiness();
  let invoiceId: string;

  try {
    invoiceId = readId(formData, "invoiceId");
    const input = parseInvoiceFormData(formData);
    const [customer, exchangeRate] = await Promise.all([
      resolveDraftRelations(business, input),
      exchangeSnapshot(business, input),
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

    await db.transaction().execute(async (transaction) => {
      await replaceDraftInvoiceAggregate(transaction, aggregate);
    });
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/");
  redirect(`/invoices/${invoiceId}`);
}

export async function updateDraftSellerAction(formData: FormData) {
  const business = await requireBusiness();
  const invoiceId = readId(formData, "invoiceId");

  const result = await db
    .updateTable("invoices")
    .set({
      ...buildInvoiceSellerSnapshot(business),
      updated_at: nowIso(),
    })
    .where("id", "=", invoiceId)
    .where("business_id", "=", business.id)
    .where("lifecycle", "=", "draft")
    .executeTakeFirst();

  if (Number(result.numUpdatedRows) !== 1) {
    throw new FormSubmissionError(
      "Only a draft invoice can update its Bill from details",
    );
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}`);
}

export async function issueInvoiceAction(formData: FormData) {
  const business = await requireBusiness();
  const invoiceId = readId(formData, "invoiceId");

  const invoice = await db
    .selectFrom("invoices")
    .select(["id", "lifecycle", "issue_date", "due_date", "currency"])
    .where("id", "=", invoiceId)
    .where("business_id", "=", business.id)
    .executeTakeFirst();

  if (!invoice || invoice.lifecycle !== "draft") {
    throw new FormSubmissionError("Only a draft can be issued");
  }

  const issueDate = invoice.issue_date ?? todayInTimeZone(business.timezone);
  const dueDate =
    invoice.due_date ?? addPaymentTerms(issueDate, business.default_payment_terms_days);
  let exchangeRate;
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
        updated_at: nowIso(),
      })
      .where("id", "=", invoiceId)
      .where("business_id", "=", business.id)
      .where("lifecycle", "=", "draft")
      .executeTakeFirst();

    if (Number(result.numUpdatedRows) !== 1) {
      throw new FormSubmissionError("This invoice has already been issued");
    }
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/payments");
  revalidatePath("/");
  redirect(`/invoices/${invoiceId}`);
}

export async function deleteDraftInvoiceAction(formData: FormData) {
  const business = await requireBusiness();
  const invoiceId = readId(formData, "invoiceId");

  await db
    .deleteFrom("invoices")
    .where("id", "=", invoiceId)
    .where("business_id", "=", business.id)
    .where("lifecycle", "=", "draft")
    .execute();

  revalidatePath("/invoices");
  revalidatePath("/");
  redirect("/invoices");
}
