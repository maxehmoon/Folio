import type { Kysely } from "kysely";

import {
  insertInvoiceAggregate,
  prepareInvoiceAggregate,
} from "@/features/invoices/aggregate";
import { db, newId, nowIso, type Database } from "@/lib/db";
import { allocateInvoiceNumber } from "@/lib/db/businesses";
import { getExchangeRate } from "@/lib/exchange-rates";
import { todayInTimeZone } from "@/lib/format";
import {
  addPaymentTerms,
  advanceSchedule,
  isOccurrenceWithinSchedule,
  occurrenceAt,
  type RecurrenceSchedule,
} from "@/lib/finance/recurrence";

export type RecurringTickResult = {
  due: number;
  generated: number;
  skipped: number;
  failed: number;
  capped: number;
  errors: Array<{
    recurringInvoiceId?: string;
    businessId?: string;
    message: string;
  }>;
};

export type RecurringBusinessTickResult = RecurringTickResult & {
  businesses: number;
};

export const MAX_OCCURRENCES_PER_SCHEDULE_PER_TICK = 100;

type DueRecurringInvoice = {
  id: string;
  business_id: string;
};

type ProcessOutcome = {
  status: "generated" | "skipped";
  moreDue: boolean;
};

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown recurring invoice error";
}

function validateToday(today: string): void {
  try {
    addPaymentTerms(today, 0);
  } catch {
    throw new TypeError("today must be a valid ISO date");
  }
}

async function processDueOccurrence(
  database: Kysely<Database>,
  candidate: DueRecurringInvoice,
  today: string,
): Promise<ProcessOutcome> {
  return database.transaction().execute(async (transaction) => {
    const recurring = await transaction
      .selectFrom("recurring_invoices")
      .selectAll()
      .where("id", "=", candidate.id)
      .where("business_id", "=", candidate.business_id)
      .executeTakeFirst();

    if (
      !recurring ||
      recurring.state !== "active" ||
      recurring.next_issue_date > today
    ) {
      return { status: "skipped", moreDue: false };
    }

    const schedule: RecurrenceSchedule = {
      startsOn: recurring.start_date,
      endsOn: recurring.end_date,
      frequency: recurring.frequency,
      intervalCount: recurring.interval_count,
    };
    const plannedDate = occurrenceAt(schedule, recurring.next_occurrence_index);

    if (!isOccurrenceWithinSchedule(schedule, plannedDate)) {
      await transaction
        .updateTable("recurring_invoices")
        .set({ state: "ended", updated_at: nowIso() })
        .where("id", "=", recurring.id)
        .where("business_id", "=", recurring.business_id)
        .where("state", "=", "active")
        .where("updated_at", "=", recurring.updated_at)
        .execute();
      return { status: "skipped", moreDue: false };
    }

    if (plannedDate > today) {
      await transaction
        .updateTable("recurring_invoices")
        .set({ next_issue_date: plannedDate, updated_at: nowIso() })
        .where("id", "=", recurring.id)
        .where("business_id", "=", recurring.business_id)
        .where("next_occurrence_index", "=", recurring.next_occurrence_index)
        .where("updated_at", "=", recurring.updated_at)
        .execute();
      return { status: "skipped", moreDue: false };
    }

    const progress = advanceSchedule(
      schedule,
      recurring.next_occurrence_index,
    );

    const timestamp = nowIso();
    const moreDue = Boolean(
      progress.nextIssueDate && progress.nextIssueDate <= today,
    );
    const recurringInvoiceId = recurring.id;
    const recurringBusinessId = recurring.business_id;
    const occurrenceIndex = recurring.next_occurrence_index;
    const recurringUpdatedAt = recurring.updated_at;

    async function advancePastCompletedRun(): Promise<ProcessOutcome> {
      await transaction
        .updateTable("recurring_invoices")
        .set({
          state: progress.nextIssueDate ? "active" : "ended",
          next_occurrence_index: progress.nextOccurrenceIndex,
          next_issue_date: progress.nextIssueDate ?? progress.issueDate,
          updated_at: nowIso(),
        })
        .where("id", "=", recurringInvoiceId)
        .where("business_id", "=", recurringBusinessId)
        .where("state", "=", "active")
        .where("next_occurrence_index", "=", occurrenceIndex)
        .where("updated_at", "=", recurringUpdatedAt)
        .execute();
      return { status: "skipped", moreDue };
    }

    let runId = newId();
    const existingRun = await transaction
      .selectFrom("recurring_runs")
      .select(["id", "status"])
      .where("recurring_invoice_id", "=", recurring.id)
      .where("occurrence_index", "=", recurring.next_occurrence_index)
      .executeTakeFirst();

    if (existingRun?.status === "completed") {
      return advancePastCompletedRun();
    }
    if (existingRun?.status === "pending") {
      return { status: "skipped", moreDue: false };
    }

    if (existingRun?.status === "failed") {
      runId = existingRun.id;
      const retry = await transaction
        .updateTable("recurring_runs")
        .set({
          status: "pending",
          invoice_id: null,
          error_message: null,
          created_at: timestamp,
          completed_at: null,
        })
        .where("id", "=", runId)
        .where("business_id", "=", recurring.business_id)
        .where("status", "=", "failed")
        .executeTakeFirst();
      if (Number(retry.numUpdatedRows) !== 1) {
        return { status: "skipped", moreDue: false };
      }
    } else {
      const runInsert = await transaction
        .insertInto("recurring_runs")
        .values({
          id: runId,
          business_id: recurring.business_id,
          recurring_invoice_id: recurring.id,
          invoice_id: null,
          occurrence_index: recurring.next_occurrence_index,
          scheduled_date: plannedDate,
          status: "pending",
          error_message: null,
          created_at: timestamp,
          completed_at: null,
        })
        .onConflict((conflict) =>
          conflict
            .columns(["recurring_invoice_id", "occurrence_index"])
            .doNothing(),
        )
        .executeTakeFirst();

      if (Number(runInsert.numInsertedOrUpdatedRows ?? 0) === 0) {
        const winningRun = await transaction
          .selectFrom("recurring_runs")
          .select("status")
          .where("recurring_invoice_id", "=", recurring.id)
          .where("occurrence_index", "=", recurring.next_occurrence_index)
          .executeTakeFirst();
        if (winningRun?.status === "completed") {
          return advancePastCompletedRun();
        }
        return { status: "skipped", moreDue: false };
      }
    }

    const [business, customer, recurringLines] = await Promise.all([
      transaction
        .selectFrom("businesses")
        .selectAll()
        .where("id", "=", recurring.business_id)
        .executeTakeFirst(),
      transaction
        .selectFrom("customers")
        .selectAll()
        .where("id", "=", recurring.customer_id)
        .where("business_id", "=", recurring.business_id)
        .executeTakeFirst(),
      transaction
        .selectFrom("recurring_invoice_lines")
        .selectAll()
        .where("recurring_invoice_id", "=", recurring.id)
        .where("business_id", "=", recurring.business_id)
        .orderBy("position", "asc")
        .execute(),
    ]);

    if (!business) throw new Error("The recurring invoice business no longer exists");
    if (!customer) throw new Error("The recurring invoice customer no longer exists");
    if (recurringLines.length === 0) {
      throw new Error("The recurring invoice has no line items");
    }

    const invoiceId = newId();
    const invoiceNumber = await allocateInvoiceNumber(
      transaction,
      recurring.business_id,
    );
    const exchangeRate = await getExchangeRate(
      recurring.currency,
      business.currency,
      progress.issueDate,
    );
    const aggregate = prepareInvoiceAggregate(
      {
        id: invoiceId,
        business,
        customer,
        recurringInvoiceId: recurring.id,
        recurrenceIndex: progress.occurrenceIndex,
        invoiceNumber,
        lifecycle: "issued",
        issueDate: progress.issueDate,
        dueDate: addPaymentTerms(
          progress.issueDate,
          recurring.payment_terms_days,
        ),
        currency: recurring.currency,
        exchangeRate,
        notes: recurring.notes,
        paymentInstructions: recurring.payment_instructions,
        lines: recurringLines.map((line) => ({
          itemId: line.item_id,
          description: line.description,
          unit: line.unit,
          quantityThousandths: line.quantity_thousandths,
          unitPriceCents: line.unit_price_cents,
          taxRateBps: line.tax_rate_bps,
        })),
        timestamp,
      },
      newId,
    );
    await insertInvoiceAggregate(transaction, aggregate);

    const scheduleUpdate = await transaction
      .updateTable("recurring_invoices")
      .set({
        state: progress.nextIssueDate ? "active" : "ended",
        next_occurrence_index: progress.nextOccurrenceIndex,
        next_issue_date: progress.nextIssueDate ?? progress.issueDate,
        updated_at: timestamp,
      })
      .where("id", "=", recurring.id)
      .where("business_id", "=", recurring.business_id)
      .where("state", "=", "active")
      .where("next_occurrence_index", "=", recurring.next_occurrence_index)
      .where("updated_at", "=", recurring.updated_at)
      .executeTakeFirst();

    if (Number(scheduleUpdate.numUpdatedRows) !== 1) {
      throw new Error("The recurring schedule changed while it was being processed");
    }

    await transaction
      .updateTable("recurring_runs")
      .set({
        invoice_id: invoiceId,
        status: "completed",
        completed_at: timestamp,
      })
      .where("id", "=", runId)
      .where("business_id", "=", recurring.business_id)
      .execute();

    return {
      status: "generated",
      moreDue: Boolean(progress.nextIssueDate && progress.nextIssueDate <= today),
    };
  });
}

async function persistFailedRun(
  database: Kysely<Database>,
  candidate: DueRecurringInvoice,
  error: unknown,
): Promise<void> {
  const recurring = await database
    .selectFrom("recurring_invoices")
    .selectAll()
    .where("id", "=", candidate.id)
    .where("business_id", "=", candidate.business_id)
    .executeTakeFirst();
  if (!recurring) return;

  let scheduledDate = recurring.next_issue_date;
  try {
    scheduledDate = occurrenceAt(
      {
        startsOn: recurring.start_date,
        endsOn: recurring.end_date,
        frequency: recurring.frequency,
        intervalCount: recurring.interval_count,
      },
      recurring.next_occurrence_index,
    );
  } catch {
    // Retain the stored date so a malformed legacy schedule still records why it failed.
  }

  const timestamp = nowIso();
  const message = readableError(error).slice(0, 2_000);
  const update = await database
    .updateTable("recurring_runs")
    .set({
      status: "failed",
      error_message: message,
      completed_at: timestamp,
    })
    .where("recurring_invoice_id", "=", recurring.id)
    .where("occurrence_index", "=", recurring.next_occurrence_index)
    .where("status", "in", ["pending", "failed"])
    .executeTakeFirst();

  if (Number(update.numUpdatedRows) > 0) return;

  await database
    .insertInto("recurring_runs")
    .values({
      id: newId(),
      business_id: recurring.business_id,
      recurring_invoice_id: recurring.id,
      invoice_id: null,
      occurrence_index: recurring.next_occurrence_index,
      scheduled_date: scheduledDate,
      status: "failed",
      error_message: message,
      created_at: timestamp,
      completed_at: timestamp,
    })
    .onConflict((conflict) =>
      conflict
        .columns(["recurring_invoice_id", "occurrence_index"])
        .doNothing(),
    )
    .execute();
}

export async function runRecurringTickWithDatabase(
  database: Kysely<Database>,
  today: string,
  businessId?: string,
): Promise<RecurringTickResult> {
  validateToday(today);

  let dueQuery = database
    .selectFrom("recurring_invoices")
    .select(["id", "business_id"])
    .where("state", "=", "active")
    .where("next_issue_date", "<=", today)
    .orderBy("next_issue_date", "asc")
    .orderBy("created_at", "asc");

  if (businessId) {
    dueQuery = dueQuery.where("business_id", "=", businessId);
  }

  const due = await dueQuery.execute();
  const result: RecurringTickResult = {
    due: due.length,
    generated: 0,
    skipped: 0,
    failed: 0,
    capped: 0,
    errors: [],
  };

  for (const candidate of due) {
    let completedCatchUp = false;
    for (
      let attempt = 0;
      attempt < MAX_OCCURRENCES_PER_SCHEDULE_PER_TICK;
      attempt += 1
    ) {
      try {
        const outcome = await processDueOccurrence(database, candidate, today);
        result[outcome.status] += 1;
        if (!outcome.moreDue) {
          completedCatchUp = true;
          break;
        }
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          recurringInvoiceId: candidate.id,
          businessId: candidate.business_id,
          message: readableError(error),
        });
        try {
          await persistFailedRun(database, candidate, error);
        } catch {
          // The original generation error remains the actionable failure.
        }
        completedCatchUp = true;
        break;
      }
    }

    if (!completedCatchUp) {
      result.capped += 1;
      result.errors.push({
        recurringInvoiceId: candidate.id,
        businessId: candidate.business_id,
        message: `Catch-up stopped after ${MAX_OCCURRENCES_PER_SCHEDULE_PER_TICK} occurrences`,
      });
    }
  }

  return result;
}

export function runRecurringTick(
  today: string,
  businessId?: string,
): Promise<RecurringTickResult> {
  return runRecurringTickWithDatabase(db, today, businessId);
}

export async function runRecurringTicksAtWithDatabase(
  database: Kysely<Database>,
  now: Date,
): Promise<RecurringBusinessTickResult> {
  if (Number.isNaN(now.valueOf())) throw new TypeError("now must be a valid date");
  const businesses = await database
    .selectFrom("businesses")
    .select(["id", "timezone"])
    .orderBy("created_at", "asc")
    .execute();
  const result: RecurringBusinessTickResult = {
    businesses: businesses.length,
    due: 0,
    generated: 0,
    skipped: 0,
    failed: 0,
    capped: 0,
    errors: [],
  };

  for (const business of businesses) {
    try {
      const localToday = todayInTimeZone(business.timezone, now);
      const businessResult = await runRecurringTickWithDatabase(
        database,
        localToday,
        business.id,
      );
      result.due += businessResult.due;
      result.generated += businessResult.generated;
      result.skipped += businessResult.skipped;
      result.failed += businessResult.failed;
      result.capped += businessResult.capped;
      result.errors.push(...businessResult.errors);
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        businessId: business.id,
        message: readableError(error),
      });
    }
  }

  return result;
}

export function runRecurringTicksAt(
  now = new Date(),
): Promise<RecurringBusinessTickResult> {
  return runRecurringTicksAtWithDatabase(db, now);
}
