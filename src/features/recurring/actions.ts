"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { FormSubmissionError } from "@/features/invoices/forms";
import { db, newId, nowIso } from "@/lib/db";
import type {
  Business,
  NewRecurringInvoice,
  NewRecurringInvoiceLine,
  RecurringInvoiceState,
} from "@/lib/db/types";
import {
  isOccurrenceWithinSchedule,
  occurrenceAt,
  type RecurrenceSchedule,
} from "@/lib/finance/recurrence";
import { requireBusiness } from "@/lib/session";

import {
  parseRecurringInvoiceFormData,
  type SubmittedRecurringInvoice,
} from "./forms";
import type { RecurringActionState } from "./types";

function readId(value: string): string {
  const id = value.trim();
  if (!id || id.length > 100) {
    throw new FormSubmissionError("The recurring invoice could not be identified");
  }
  return id;
}

async function resolveRelations(
  business: Business,
  input: SubmittedRecurringInvoice,
): Promise<void> {
  const itemIds = [
    ...new Set(
      input.lines.flatMap((line) => (line.itemId ? [line.itemId] : [])),
    ),
  ];
  const [customer, items] = await Promise.all([
    db
      .selectFrom("customers")
      .select("id")
      .where("id", "=", input.customerId)
      .where("business_id", "=", business.id)
      .executeTakeFirst(),
    itemIds.length > 0
      ? db
          .selectFrom("items")
          .select("id")
          .where("business_id", "=", business.id)
          .where("id", "in", itemIds)
          .execute()
      : Promise.resolve([]),
  ]);

  if (!customer) throw new FormSubmissionError("Choose a valid customer");
  if (items.length !== itemIds.length) {
    throw new FormSubmissionError("One or more saved items are unavailable");
  }
}

function recurringLines(
  recurringInvoiceId: string,
  businessId: string,
  input: SubmittedRecurringInvoice,
  timestamp: string,
): NewRecurringInvoiceLine[] {
  return input.lines.map((line, position) => ({
    id: newId(),
    business_id: businessId,
    recurring_invoice_id: recurringInvoiceId,
    item_id: line.itemId,
    position,
    description: line.description,
    details: line.details,
    unit: line.unit,
    quantity_thousandths: line.quantityThousandths,
    unit_price_cents: line.unitPriceCents,
    tax_rate_bps: line.taxRateBps,
    created_at: timestamp,
    updated_at: timestamp,
  }));
}

function scheduleFrom(input: SubmittedRecurringInvoice): RecurrenceSchedule {
  return {
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    frequency: input.frequency,
    intervalCount: input.intervalCount,
  };
}

function actionError(error: unknown): RecurringActionState {
  if (error instanceof FormSubmissionError) return { error: error.message };
  throw error;
}

export async function createRecurringInvoiceAction(
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const business = await requireBusiness();

  try {
    const input = parseRecurringInvoiceFormData(formData);
    await resolveRelations(business, input);
    const recurringInvoiceId = newId();
    const timestamp = nowIso();
    const recurringInvoice: NewRecurringInvoice = {
      id: recurringInvoiceId,
      business_id: business.id,
      customer_id: input.customerId,
      state: "active",
      frequency: input.frequency,
      interval_count: input.intervalCount,
      start_date: input.startsOn,
      end_date: input.endsOn,
      next_issue_date: input.startsOn,
      next_occurrence_index: 0,
      payment_terms_days: input.paymentTermsDays,
      currency: input.currency,
      notes: input.notes,
      payment_instructions: input.paymentInstructions,
      created_at: timestamp,
      updated_at: timestamp,
    };

    await db.transaction().execute(async (transaction) => {
      await transaction
        .insertInto("recurring_invoices")
        .values(recurringInvoice)
        .execute();
      await transaction
        .insertInto("recurring_invoice_lines")
        .values(
          recurringLines(recurringInvoiceId, business.id, input, timestamp),
        )
        .execute();
    });
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/recurring");
  revalidatePath("/");
  redirect("/recurring");
}

export async function updateRecurringInvoiceAction(
  recurringInvoiceId: string,
  _state: RecurringActionState,
  formData: FormData,
): Promise<RecurringActionState> {
  const business = await requireBusiness();

  try {
    const id = readId(recurringInvoiceId);
    const input = parseRecurringInvoiceFormData(formData);
    await resolveRelations(business, input);
    const existing = await db
      .selectFrom("recurring_invoices")
      .select(["id", "state", "next_occurrence_index", "updated_at"])
      .where("id", "=", id)
      .where("business_id", "=", business.id)
      .executeTakeFirst();

    if (!existing) {
      throw new FormSubmissionError("This recurring invoice is no longer available");
    }

    const schedule = scheduleFrom(input);
    const nextIssueDate = occurrenceAt(schedule, existing.next_occurrence_index);
    const nextState: RecurringInvoiceState = isOccurrenceWithinSchedule(
      schedule,
      nextIssueDate,
    )
      ? existing.state
      : "ended";
    const timestamp = nowIso();

    await db.transaction().execute(async (transaction) => {
      const update = await transaction
        .updateTable("recurring_invoices")
        .set({
          customer_id: input.customerId,
          state: nextState,
          frequency: input.frequency,
          interval_count: input.intervalCount,
          start_date: input.startsOn,
          end_date: input.endsOn,
          next_issue_date: nextIssueDate,
          payment_terms_days: input.paymentTermsDays,
          currency: input.currency,
          notes: input.notes,
          payment_instructions: input.paymentInstructions,
          updated_at: timestamp,
        })
        .where("id", "=", id)
        .where("business_id", "=", business.id)
        .where("next_occurrence_index", "=", existing.next_occurrence_index)
        .where("updated_at", "=", existing.updated_at)
        .executeTakeFirst();

      if (Number(update.numUpdatedRows) !== 1) {
        throw new FormSubmissionError(
          "The schedule changed while you were editing it. Try again",
        );
      }

      await transaction
        .deleteFrom("recurring_invoice_lines")
        .where("business_id", "=", business.id)
        .where("recurring_invoice_id", "=", id)
        .execute();
      await transaction
        .insertInto("recurring_invoice_lines")
        .values(recurringLines(id, business.id, input, timestamp))
        .execute();
    });
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/recurring");
  revalidatePath(`/recurring/${recurringInvoiceId}/edit`);
  revalidatePath("/");
  redirect("/recurring");
}

async function transitionRecurringInvoice(
  recurringInvoiceId: string,
  from: RecurringInvoiceState[],
  to: RecurringInvoiceState,
): Promise<void> {
  const business = await requireBusiness();
  const id = readId(recurringInvoiceId);
  const update = await db
    .updateTable("recurring_invoices")
    .set({ state: to, updated_at: nowIso() })
    .where("id", "=", id)
    .where("business_id", "=", business.id)
    .where("state", "in", from)
    .executeTakeFirst();

  if (Number(update.numUpdatedRows) !== 1) notFound();
  revalidatePath("/recurring");
  revalidatePath(`/recurring/${id}/edit`);
  revalidatePath("/");
}

export async function pauseRecurringInvoiceAction(
  recurringInvoiceId: string,
): Promise<void> {
  await transitionRecurringInvoice(recurringInvoiceId, ["active"], "paused");
}

export async function resumeRecurringInvoiceAction(
  recurringInvoiceId: string,
): Promise<void> {
  await transitionRecurringInvoice(recurringInvoiceId, ["paused"], "active");
}

export async function archiveRecurringInvoiceAction(
  recurringInvoiceId: string,
): Promise<void> {
  await transitionRecurringInvoice(
    recurringInvoiceId,
    ["active", "paused"],
    "ended",
  );
}
