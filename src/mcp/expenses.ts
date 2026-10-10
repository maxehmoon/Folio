import { sql } from "kysely";
import { z } from "zod";

import { expenseFormSchema, expenseIdSchema } from "@/features/expenses/schema";
import { expenseReceipt, receiptColumns } from "@/features/expenses/receipt";
import { db, newId, nowIso } from "@/lib/db";
import { likeContainsPattern } from "@/lib/db/like";

import { imageDataUrlSchema } from "./images";
import { McpToolError, type McpContext, type ToolRegistrar } from "./types";

const fields = expenseFormSchema.shape;
const centsSchema = z.number().int().min(0).max(2_147_483_647)
  .describe("Integer hundredths of the currency; 1250 means 12.50.");
const expenseFields = {
  vendor: fields.vendor,
  category: fields.category,
  description: fields.description.nullable().optional(),
  expense_date: fields.expense_date,
  currency: fields.currency,
  subtotal_cents: centsSchema,
  tax_cents: centsSchema,
  reference: fields.reference.nullable().optional(),
  notes: fields.notes.nullable().optional(),
};
const expenseWriteSchema = z.object(expenseFields);
const expensePatchSchema = expenseWriteSchema.partial().strict()
  .refine((changes) => Object.keys(changes).length > 0, "Provide at least one field to update.");
const expenseColumns = [
  "id", "vendor", "category", "description", "expense_date", "currency",
  "subtotal_cents", "tax_cents", "total_cents", "reference", "notes",
  "created_at", "updated_at",
] as const;

function expenseValues(input: z.output<typeof expenseWriteSchema>) {
  const parsed = expenseFormSchema.parse({
    ...input,
    description: input.description ?? "",
    reference: input.reference ?? "",
    notes: input.notes ?? "",
    subtotal: (input.subtotal_cents / 100).toFixed(2),
    tax: (input.tax_cents / 100).toFixed(2),
  });
  return {
    vendor: parsed.vendor,
    category: parsed.category,
    description: parsed.description,
    expense_date: parsed.expense_date,
    currency: parsed.currency,
    subtotal_cents: input.subtotal_cents,
    tax_cents: input.tax_cents,
    total_cents: input.subtotal_cents + input.tax_cents,
    reference: parsed.reference,
    notes: parsed.notes,
  };
}

export function registerExpenseTools(register: ToolRegistrar, context: McpContext) {
  const businessId = context.business.id;
  const expenses = () => db.selectFrom("expenses").where("business_id", "=", businessId);
  const selection = () => expenses().select(expenseColumns)
    .select(sql<number>`case when receipt_data_url is not null or receipt_url is not null then 1 else 0 end`.as("has_receipt"));
  const getExpense = async (id: string) => {
    const row = await selection().where("id", "=", id).executeTakeFirst();
    if (!row) throw new McpToolError("NOT_FOUND", "Expense not found.");
    return { ...row, has_receipt: Boolean(row.has_receipt) };
  };

  register("folio_list_expenses", {
    description: "List the authenticated business's expenses, newest first. Search vendor, category, description or reference. Filter by category, currency or inclusive expense dates. Receipt images are excluded; use folio_get_expense_receipt.",
    inputSchema: {
      q: z.string().trim().max(100).default("").describe("Literal, case-insensitive text search; % and _ are not wildcards."),
      category: fields.category.optional(),
      currency: fields.currency.optional(),
      date_from: fields.expense_date.optional(),
      date_to: fields.expense_date.optional(),
      page: z.number().int().min(1).max(10_000).default(1),
      limit: z.number().int().min(1).max(100).default(25),
    },
    readOnly: true,
  }, async ({ q, category, currency, date_from, date_to, page, limit }) => {
    if (date_from && date_to && date_from > date_to) {
      throw new McpToolError("INVALID_INPUT", "The start date must not be after the end date.");
    }
    let query = selection();
    if (category) query = query.where("category", "=", category);
    if (currency) query = query.where("currency", "=", currency);
    if (date_from) query = query.where("expense_date", ">=", date_from);
    if (date_to) query = query.where("expense_date", "<=", date_to);
    if (q) {
      const pattern = likeContainsPattern(q.toLowerCase());
      query = query.where(sql<boolean>`(
        lower(vendor) like ${pattern} escape '!'
        or lower(category) like ${pattern} escape '!'
        or lower(coalesce(description, '')) like ${pattern} escape '!'
        or lower(coalesce(reference, '')) like ${pattern} escape '!'
      )`);
    }
    const [rows, count] = await Promise.all([
      query.orderBy("expense_date", "desc").orderBy("created_at", "desc")
        .orderBy("id").limit(limit).offset((page - 1) * limit).execute(),
      query.clearSelect().select(({ fn }) => fn.countAll<number>().as("total")).executeTakeFirstOrThrow(),
    ]);
    const total = Number(count.total);
    return {
      expenses: rows.map((row) => ({ ...row, has_receipt: Boolean(row.has_receipt) })),
      pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
    };
  });

  register("folio_get_expense", {
    description: "Read an expense. Amounts are integer hundredths of its currency. Receipt contents are excluded; has_receipt indicates whether an image or legacy receipt link exists.",
    inputSchema: { id: expenseIdSchema }, readOnly: true,
  }, async ({ id }) => getExpense(id));

  register("folio_create_expense", {
    description: "Create an expense. Subtotal and tax are integer hundredths (1250 = 12.50); tax defaults to zero and the positive total is calculated automatically. Use folio_set_expense_receipt to attach an image.",
    inputSchema: { ...expenseFields, tax_cents: centsSchema.default(0) },
  }, async (input) => {
    const values = expenseValues(input);
    const id = newId();
    const timestamp = nowIso();
    await db.insertInto("expenses").values({
      ...values, id, business_id: businessId, receipt_url: null, receipt_data_url: null,
      created_at: timestamp, updated_at: timestamp,
    }).executeTakeFirstOrThrow();
    return getExpense(id);
  });

  register("folio_update_expense", {
    description: "Patch an expense, preserving omitted fields and its receipt. Null or empty optional text clears that field. Subtotal and tax are integer hundredths; the positive total is recalculated automatically. If another update changes the amounts concurrently, reread the expense before retrying a CONFLICT.",
    inputSchema: { id: expenseIdSchema, changes: expensePatchSchema }, idempotent: true,
  }, async ({ id, changes }) => {
    const existing = await getExpense(id);
    const values = expenseValues({ ...existing, ...changes });
    const updates = Object.fromEntries(Object.keys(changes).map((key) => [key, values[key as keyof typeof values]]));
    const changesAmounts = changes.subtotal_cents !== undefined || changes.tax_cents !== undefined;
    if (changesAmounts) {
      updates.total_cents = values.total_cents;
    }
    let query = db.updateTable("expenses").set({ ...updates, updated_at: nowIso() })
      .where("business_id", "=", businessId).where("id", "=", id);
    if (changesAmounts) {
      query = query.where("subtotal_cents", "=", existing.subtotal_cents)
        .where("tax_cents", "=", existing.tax_cents);
    }
    const result = await query.executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) {
      await getExpense(id);
      throw new McpToolError("CONFLICT", "The expense amounts changed. Read the expense again before retrying.");
    }
    return getExpense(id);
  });

  register("folio_delete_expense", {
    description: "Permanently delete an expense and its stored receipt. Requires confirm=true after the user has approved deletion; this cannot be undone.",
    inputSchema: { id: expenseIdSchema, confirm: z.literal(true) }, destructive: true,
  }, async ({ id }) => {
    const result = await db.deleteFrom("expenses")
      .where("business_id", "=", businessId).where("id", "=", id).executeTakeFirst();
    if (Number(result.numDeletedRows) === 0) throw new McpToolError("NOT_FOUND", "Expense not found.");
    return { id, deleted: true };
  });

  register("folio_get_expense_receipt", {
    description: "Read an expense's receipt: a base64 image data URL, a legacy link, or null when absent. Legacy links are returned without fetching their contents.",
    inputSchema: { id: expenseIdSchema }, readOnly: true,
  }, async ({ id }) => {
    const row = await expenses().select(["receipt_data_url", "receipt_url"])
      .where("id", "=", id).executeTakeFirst();
    if (!row) throw new McpToolError("NOT_FOUND", "Expense not found.");
    return { id, receipt: expenseReceipt(row) };
  });

  register("folio_set_expense_receipt", {
    description: "Replace an expense receipt with a PNG, JPEG or WebP base64 data URL up to 512 KB, or pass null to remove it. Replacement or removal also clears any legacy receipt link.",
    inputSchema: { id: expenseIdSchema, data_url: imageDataUrlSchema.nullable() }, idempotent: true,
  }, async ({ id, data_url }) => {
    const values = receiptColumns({ receipt_data_url: null, receipt_url: null },
      data_url === null ? { kind: "remove" } : { kind: "replace", dataUrl: data_url });
    const result = await db.updateTable("expenses").set({ ...values, updated_at: nowIso() })
      .where("business_id", "=", businessId).where("id", "=", id).executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) throw new McpToolError("NOT_FOUND", "Expense not found.");
    return getExpense(id);
  });
}
