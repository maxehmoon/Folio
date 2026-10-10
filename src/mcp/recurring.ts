import { z } from "zod";

import { FormSubmissionError } from "@/features/invoices/forms";
import {
  parseRecurringInvoiceFormData,
  type SubmittedRecurringInvoice,
} from "@/features/recurring/forms";
import { getRecurringInvoiceDetail } from "@/features/recurring/queries";
import { runRecurringTick } from "@/features/recurring/service";
import { db, newId, nowIso, type DatabaseExecutor } from "@/lib/db";
import type { RecurringInvoiceState } from "@/lib/db/types";
import { INVOICE_CURRENCY_CODES } from "@/lib/currencies";
import { todayInTimeZone } from "@/lib/format";
import { calculateInvoiceTotals, calculateLine } from "@/lib/finance/money";
import { addPaymentTerms, isOccurrenceWithinSchedule, occurrenceAt } from "@/lib/finance/recurrence";
import { isIsoDate } from "@/lib/iso-date";

import { McpToolError, type McpContext, type ToolRegistrar } from "./types";

const idSchema = z.string().trim().min(1).max(100);
const dateSchema = z.string().refine(isIsoDate, "Use a valid YYYY-MM-DD date");
const pagination = {
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(1_000_000).default(0),
};
const scheduleFields = {
  startsOn: dateSchema,
  endsOn: dateSchema.nullable().optional(),
  frequency: z.enum(["day", "week", "month", "year"]),
  intervalCount: z.number().int().min(1).max(1_000).default(1),
  paymentTermsDays: z.number().int().min(0).max(3_650).default(14),
};
const recurringFields = {
  ...scheduleFields,
  customerId: idSchema,
  currency: z.string().trim().toUpperCase().refine((value) => INVOICE_CURRENCY_CODES.has(value), "Choose a supported currency"),
  notes: z.string().trim().max(5_000).nullable().optional(),
  paymentInstructions: z.string().trim().max(2_000).nullable().optional(),
  lines: z.array(z.object({
    itemId: idSchema.nullable().optional(),
    description: z.string().trim().min(1).max(500),
    details: z.string().trim().max(5_000).nullable().optional(),
    unit: z.string().trim().min(1).max(40),
    quantityThousandths: z.number().int().min(1).max(2_147_483_647).describe("Quantity × 1,000; use 1,000 for one unit"),
    unitPriceCents: z.number().int().min(0).max(2_147_483_647).describe("Unit price in hundredths of the invoice currency; 100 = 1.00"),
    taxRateBps: z.number().int().min(0).max(10_000).default(0).describe("Tax in basis points; 2,000 = 20%"),
  }).strict()).min(1).max(100),
};
type RecurringInput = z.output<z.ZodObject<typeof recurringFields>>;

function parseInput(input: RecurringInput): SubmittedRecurringInvoice {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (key !== "lines") form.set(key, value === null || value === undefined ? "" : String(value));
  }
  form.set("lines", JSON.stringify(input.lines.map((line) => ({
    ...line,
    quantity: (line.quantityThousandths / 1_000).toFixed(3),
    unitPrice: (line.unitPriceCents / 100).toFixed(2),
    taxRate: (line.taxRateBps / 100).toFixed(2),
  }))));
  try {
    return parseRecurringInvoiceFormData(form);
  } catch (error) {
    if (error instanceof FormSubmissionError) throw new McpToolError("INVALID_INPUT", error.message);
    throw error;
  }
}

async function resolveRelations(database: DatabaseExecutor, businessId: string, input: SubmittedRecurringInvoice) {
  const itemIds = [...new Set(input.lines.flatMap((line) => line.itemId ? [line.itemId] : []))];
  const [customer, items] = await Promise.all([
    database.selectFrom("customers").select("id")
      .where("business_id", "=", businessId).where("id", "=", input.customerId).executeTakeFirst(),
    itemIds.length ? database.selectFrom("items").select("id")
      .where("business_id", "=", businessId).where("id", "in", itemIds).execute() : [],
  ]);
  if (!customer) throw new McpToolError("NOT_FOUND", "Choose a customer belonging to this business");
  if (items.length !== itemIds.length) throw new McpToolError("NOT_FOUND", "One or more saved items are unavailable");
}

function lineRows(input: SubmittedRecurringInvoice, recurringInvoiceId: string, businessId: string, timestamp: string) {
  return input.lines.map((line, position) => ({
    id: newId(), business_id: businessId, recurring_invoice_id: recurringInvoiceId,
    item_id: line.itemId, position, description: line.description, details: line.details,
    unit: line.unit, quantity_thousandths: line.quantityThousandths,
    unit_price_cents: line.unitPriceCents, tax_rate_bps: line.taxRateBps,
    created_at: timestamp, updated_at: timestamp,
  }));
}

async function requireRecurring(businessId: string, recurringInvoiceId: string) {
  const detail = await getRecurringInvoiceDetail(businessId, recurringInvoiceId);
  if (!detail) throw new McpToolError("NOT_FOUND", "Recurring invoice not found");
  return detail;
}

function safeRunError(message: string | null): string | null {
  if (!message) return null;
  const knownErrors = [
    "The recurring invoice business no longer exists",
    "The recurring invoice customer no longer exists",
    "The recurring invoice has no line items",
    "The recurring schedule changed while it was being processed",
  ];
  if (knownErrors.includes(message)) return message;
  if (message.startsWith("Catch-up stopped after ")) return "Catch-up reached the per-call limit; run due invoices again to continue";
  if (message.startsWith("Exchange-rate provider ")) return "The exchange-rate provider could not supply a usable rate; retry later";
  return "Generation failed; check the schedule and server logs for details";
}

export function registerRecurringTools(register: ToolRegistrar, context: McpContext): void {
  const businessId = context.business.id;

  register("folio_list_recurring_invoices", {
    description: "List recurring invoice schedules with totals, optional state/customer filters and pagination. Amounts use integer hundredths of their currency.",
    readOnly: true,
    inputSchema: { ...pagination, state: z.enum(["active", "paused", "ended"]).optional(), customerId: idSchema.optional() },
  }, async ({ limit, offset, state, customerId }) => {
    let query = db.selectFrom("recurring_invoices as recurring")
      .innerJoin("customers as customer", (join) => join
        .onRef("customer.id", "=", "recurring.customer_id")
        .onRef("customer.business_id", "=", "recurring.business_id"))
      .select(["recurring.id", "recurring.state", "recurring.frequency", "recurring.interval_count", "recurring.start_date", "recurring.end_date", "recurring.next_issue_date", "recurring.next_occurrence_index", "recurring.currency", "recurring.updated_at", "customer.id as customerId", "customer.name as customerName"])
      .where("recurring.business_id", "=", businessId);
    if (state) query = query.where("recurring.state", "=", state);
    if (customerId) query = query.where("recurring.customer_id", "=", customerId);
    const rows = await query.orderBy("recurring.next_issue_date", "asc").orderBy("recurring.id", "asc").offset(offset).limit(limit + 1).execute();
    const page = rows.slice(0, limit);
    const lines = page.length ? await db.selectFrom("recurring_invoice_lines")
      .select(["recurring_invoice_id", "quantity_thousandths", "unit_price_cents", "tax_rate_bps"])
      .where("business_id", "=", businessId).where("recurring_invoice_id", "in", page.map((row) => row.id)).execute() : [];
    const totals = new Map<string, ReturnType<typeof calculateLine>[]>();
    for (const line of lines) {
      const current = totals.get(line.recurring_invoice_id) ?? [];
      current.push(calculateLine({ quantityThousandths: line.quantity_thousandths, unitPriceCents: line.unit_price_cents, taxRateBps: line.tax_rate_bps }));
      totals.set(line.recurring_invoice_id, current);
    }
    return { recurringInvoices: page.map((row) => ({ ...row, ...calculateInvoiceTotals(totals.get(row.id) ?? []) })), nextOffset: rows.length > limit ? offset + limit : null };
  });

  register("folio_get_recurring_invoice", {
    description: "Get a recurring invoice schedule and its line items, including updated_at for a subsequent update.",
    readOnly: true,
    inputSchema: { id: idSchema },
  }, async ({ id }) => requireRecurring(businessId, id));

  register("folio_preview_recurring_dates", {
    description: "Preview up to 100 issue and due dates without saving or generating invoices. Monthly/yearly schedules retain the original date anchor and clamp short months.",
    readOnly: true,
    inputSchema: { ...scheduleFields, count: z.number().int().min(1).max(100).default(12), fromOccurrenceIndex: z.number().int().min(0).max(1_000_000).default(0) },
  }, async ({ count, fromOccurrenceIndex, paymentTermsDays, ...schedule }) => {
    try {
      const dates: Array<{ occurrenceIndex: number; issueDate: string; dueDate: string }> = [];
      for (let offset = 0; offset < count; offset += 1) {
        const occurrenceIndex = fromOccurrenceIndex + offset;
        const issueDate = occurrenceAt(schedule, occurrenceIndex);
        if (!isOccurrenceWithinSchedule(schedule, issueDate)) break;
        const dueDate = addPaymentTerms(issueDate, paymentTermsDays);
        if (!isIsoDate(issueDate) || !isIsoDate(dueDate)) throw new RangeError();
        dates.push({ occurrenceIndex, issueDate, dueDate });
      }
      return { dates };
    } catch {
      throw new McpToolError("INVALID_INPUT", "Check the recurrence schedule and requested dates");
    }
  });

  register("folio_create_recurring_invoice", {
    description: "Create an active recurring invoice schedule. This does not issue invoices immediately; the scheduler or run-due tool generates due occurrences. Lines use integer cents, thousandths and basis points.",
    inputSchema: recurringFields,
  }, async (values) => {
    const input = parseInput(values);
    const id = newId();
    const timestamp = nowIso();
    await db.transaction().execute(async (transaction) => {
      await resolveRelations(transaction, businessId, input);
      await transaction.insertInto("recurring_invoices").values({
        id, business_id: businessId, customer_id: input.customerId, state: "active",
        frequency: input.frequency, interval_count: input.intervalCount,
        start_date: input.startsOn, end_date: input.endsOn, next_issue_date: input.startsOn,
        next_occurrence_index: 0, payment_terms_days: input.paymentTermsDays,
        currency: input.currency, notes: input.notes, payment_instructions: input.paymentInstructions,
        created_at: timestamp, updated_at: timestamp,
      }).execute();
      await transaction.insertInto("recurring_invoice_lines").values(lineRows(input, id, businessId, timestamp)).execute();
    });
    return requireRecurring(businessId, id);
  });

  register("folio_update_recurring_invoice", {
    description: "Replace a recurring schedule and all line items. Supply expectedUpdatedAt from get; stale edits fail safely. Generated invoices stay unchanged and the next occurrence index is preserved. Ended schedules remain ended.",
    inputSchema: { id: idSchema, expectedUpdatedAt: z.iso.datetime(), ...recurringFields },
  }, async ({ id, expectedUpdatedAt, ...values }) => {
    const input = parseInput(values);
    await db.transaction().execute(async (transaction) => {
      const existing = await transaction.selectFrom("recurring_invoices").selectAll()
        .where("business_id", "=", businessId).where("id", "=", id).executeTakeFirst();
      if (!existing) throw new McpToolError("NOT_FOUND", "Recurring invoice not found");
      if (existing.updated_at !== expectedUpdatedAt) throw new McpToolError("CONFLICT", "The schedule has changed. Fetch it again before updating");
      await resolveRelations(transaction, businessId, input);
      let nextIssueDate: string;
      let state: RecurringInvoiceState;
      try {
        nextIssueDate = occurrenceAt(input, existing.next_occurrence_index);
        if (!isIsoDate(nextIssueDate)) throw new RangeError();
        state = isOccurrenceWithinSchedule(input, nextIssueDate) ? existing.state : "ended";
      } catch {
        throw new McpToolError("INVALID_INPUT", "The schedule produces an unsupported next issue date");
      }
      const timestamp = nowIso(new Date(Math.max(Date.now(), Date.parse(existing.updated_at) + 1)));
      const update = await transaction.updateTable("recurring_invoices").set({
        customer_id: input.customerId, state, frequency: input.frequency, interval_count: input.intervalCount,
        start_date: input.startsOn, end_date: input.endsOn, next_issue_date: nextIssueDate,
        payment_terms_days: input.paymentTermsDays, currency: input.currency,
        notes: input.notes, payment_instructions: input.paymentInstructions, updated_at: timestamp,
      }).where("business_id", "=", businessId).where("id", "=", id)
        .where("updated_at", "=", expectedUpdatedAt)
        .where("next_occurrence_index", "=", existing.next_occurrence_index).executeTakeFirst();
      if (Number(update.numUpdatedRows) !== 1) throw new McpToolError("CONFLICT", "The schedule changed while it was being updated. Fetch it again");
      await transaction.deleteFrom("recurring_invoice_lines").where("business_id", "=", businessId).where("recurring_invoice_id", "=", id).execute();
      await transaction.insertInto("recurring_invoice_lines").values(lineRows(input, id, businessId, timestamp)).execute();
    });
    return requireRecurring(businessId, id);
  });

  for (const transition of [
    { action: "pause", from: ["active"], to: "paused", description: "Pause future generation for an active recurring invoice schedule." },
    { action: "resume", from: ["paused"], to: "active", description: "Resume a paused recurring invoice. The scheduler will catch up any missed occurrences." },
    { action: "end", from: ["active", "paused"], to: "ended", description: "Permanently end a recurring schedule. Generated invoices and run history are preserved; ended schedules cannot be resumed." },
  ] satisfies Array<{ action: string; from: RecurringInvoiceState[]; to: RecurringInvoiceState; description: string }>) {
    register(`folio_${transition.action}_recurring_invoice`, {
      description: transition.description,
      idempotent: true,
      destructive: transition.to === "ended",
      inputSchema: { id: idSchema },
    }, async ({ id }) => {
      const update = await db.updateTable("recurring_invoices").set({ state: transition.to, updated_at: nowIso() })
        .where("business_id", "=", businessId).where("id", "=", id).where("state", "in", transition.from).executeTakeFirst();
      const detail = await requireRecurring(businessId, id);
      if (Number(update.numUpdatedRows) !== 1 && detail.recurringInvoice.state !== transition.to) {
        throw new McpToolError("CONFLICT", `Cannot ${transition.action} a ${detail.recurringInvoice.state} recurring invoice`);
      }
      return detail;
    });
  }

  register("folio_run_due_recurring_invoices", {
    description: "Generate and issue due recurring invoices for this business only, through today in the business timezone or an earlier date. Existing occurrences are deduplicated. Each schedule catches up at most 100 occurrences per call; inspect capped/failed counts and run history.",
    idempotent: false,
    openWorld: true,
    inputSchema: { throughDate: dateSchema.optional() },
  }, async ({ throughDate }) => {
    const today = todayInTimeZone(context.business.timezone);
    if (throughDate && throughDate > today) throw new McpToolError("INVALID_INPUT", "Cannot generate recurring invoices before their issue date");
    const result = await runRecurringTick(throughDate ?? today, businessId);
    return {
      ...result,
      errors: result.errors.slice(0, 100).map(({ recurringInvoiceId, message }) => ({ recurringInvoiceId, message: safeRunError(message) })),
      errorsTruncated: result.errors.length > 100,
    };
  });

  register("folio_recurring_invoice_history", {
    description: "List the generated invoice IDs and status of recurring runs, newest occurrence first. Failed runs can be retried with run-due after correcting their schedule.",
    readOnly: true,
    inputSchema: { id: idSchema, ...pagination },
  }, async ({ id, limit, offset }) => {
    await requireRecurring(businessId, id);
    const rows = await db.selectFrom("recurring_runs")
      .select(["id", "invoice_id", "occurrence_index", "scheduled_date", "status", "error_message", "created_at", "completed_at"])
      .where("business_id", "=", businessId).where("recurring_invoice_id", "=", id)
      .orderBy("occurrence_index", "desc").orderBy("id", "desc").limit(limit + 1).offset(offset).execute();
    return { runs: rows.slice(0, limit).map((row) => ({ ...row, error_message: safeRunError(row.error_message) })), nextOffset: rows.length > limit ? offset + limit : null };
  });
}
