import "server-only";

import { sql } from "kysely";
import { z } from "zod";

import { PaymentFormError } from "@/features/payments/forms";
import { deletePayment, recordPayment } from "@/features/payments/service";
import { db } from "@/lib/db";
import { deriveInvoiceStatus, invoiceBalance } from "@/lib/finance/money";
import { todayInTimeZone } from "@/lib/format";
import { isIsoDate } from "@/lib/iso-date";

import { McpToolError, type McpContext, type ToolRegistrar } from "./types";

const id = z.string().trim().min(1).max(100);
const currency = z.string().regex(/^[A-Z]{3}$/, "Use an uppercase three-letter currency code");
const date = z.string().refine(isIsoDate, "Use a valid date in YYYY-MM-DD format");
const method = z.enum(["bank_transfer", "card", "cash", "cheque", "other"]);
const pagination = {
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
};

function paymentQuery(businessId: string) {
  return db.selectFrom("payments")
    .innerJoin("invoices", (join) => join
      .onRef("invoices.id", "=", "payments.invoice_id")
      .onRef("invoices.business_id", "=", "payments.business_id"))
    .where("payments.business_id", "=", businessId);
}

function pageResult(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function registerPaymentTools(register: ToolRegistrar, context: McpContext) {
  const businessId = context.business.id;

  register("folio_list_payments", {
    description: "List recorded receipts for this business, newest payment date first, with pagination and optional invoice, customer, currency, method and inclusive date filters. amount_cents is the original receipt in its currency; applied_amount_cents is its allocation in the invoice's current currency. All amounts are integer cents. A receipt records an existing payment and does not transfer money.",
    inputSchema: {
      ...pagination,
      invoiceId: id.optional(),
      customerId: id.optional(),
      currency: currency.optional(),
      method: method.optional(),
      fromDate: date.optional(),
      toDate: date.optional(),
    },
    readOnly: true,
  }, async (input) => {
    if (input.fromDate && input.toDate && input.fromDate > input.toDate) {
      throw new McpToolError("INVALID_INPUT", "fromDate must not be after toDate");
    }
    let query = paymentQuery(businessId);
    if (input.invoiceId) query = query.where("payments.invoice_id", "=", input.invoiceId);
    if (input.customerId) query = query.where("invoices.customer_id", "=", input.customerId);
    if (input.currency) query = query.where("payments.currency", "=", input.currency);
    if (input.method) query = query.where("payments.method", "=", input.method);
    if (input.fromDate) query = query.where("payments.payment_date", ">=", input.fromDate);
    if (input.toDate) query = query.where("payments.payment_date", "<=", input.toDate);
    const [payments, count] = await Promise.all([
      query.selectAll("payments").select([
        "invoices.invoice_number as invoiceNumber", "invoices.customer_id as customerId",
        "invoices.customer_name as customerName", "invoices.currency as invoiceCurrency",
      ]).orderBy("payments.payment_date", "desc")
        .orderBy("payments.created_at", "desc").orderBy("payments.id", "desc")
        .limit(input.pageSize).offset((input.page - 1) * input.pageSize).execute(),
      query.select(({ fn }) => fn.countAll<number>().as("total")).executeTakeFirstOrThrow(),
    ]);
    return { payments, ...pageResult(Number(count.total), input.page, input.pageSize) };
  });

  register("folio_get_payment", {
    description: "Get a recorded receipt by payment ID, including its original currency, integer amount_cents, allocation in the invoice's current currency, exchange-rate snapshot, reference and notes. Only receipts belonging to this business are available.",
    inputSchema: { paymentId: id },
    readOnly: true,
  }, async ({ paymentId }) => {
    const payment = await paymentQuery(businessId).selectAll("payments").select([
      "invoices.invoice_number as invoiceNumber", "invoices.customer_id as customerId",
      "invoices.customer_name as customerName", "invoices.currency as invoiceCurrency",
    ]).where("payments.id", "=", paymentId).executeTakeFirst();
    if (!payment) throw new McpToolError("NOT_FOUND", "Payment not found");
    return { payment };
  });

  register("folio_record_payment", {
    description: "Record money already received against an issued invoice. This does not charge a customer or transfer money. Specify amountCents as positive integer cents (1250 means 12.50), the invoice's current currency, and the payment date. Rejects drafts, void invoices, currency mismatches and overpayments, including concurrent submissions. Preserves the invoice's exchange-rate snapshot. This operation is not idempotent: inspect existing receipts before retrying an uncertain result.",
    inputSchema: {
      invoiceId: id,
      currency,
      paymentDate: date,
      amountCents: z.number().int().min(1).max(2_147_483_647)
        .describe("Amount in integer cents of the invoice currency; 1250 means 12.50"),
      method,
      reference: z.string().trim().max(200).nullable().optional(),
      notes: z.string().trim().max(2_000).nullable().optional(),
    },
    readOnly: false,
    idempotent: false,
  }, async (input) => {
    try {
      const payment = await recordPayment(db, businessId, {
        ...input,
        reference: input.reference || null,
        notes: input.notes || null,
      });
      return { payment };
    } catch (error) {
      if (error instanceof PaymentFormError) throw new McpToolError("INVALID_INPUT", error.message);
      throw error;
    }
  });

  register("folio_delete_payment", {
    description: "Permanently delete a recorded receipt and restore the corresponding invoice balance. This does not refund or move money. Requires confirm=true to acknowledge removal of the receipt.",
    inputSchema: { paymentId: id, confirm: z.literal(true) },
    readOnly: false,
    destructive: true,
    idempotent: true,
  }, async ({ paymentId }) => {
    const payment = await deletePayment(db, businessId, paymentId);
    if (!payment) throw new McpToolError("NOT_FOUND", "Payment not found");
    return { deleted: true, paymentId: payment.id, invoiceId: payment.invoice_id };
  });

  register("folio_list_payable_invoices", {
    description: "List issued invoices with a positive balance that can receive payments, with pagination and optional customer, currency and overdue filters. Balances use each receipt's allocation in the invoice currency. All amounts are integer cents; overdue status uses the business timezone. Use an invoice ID and its currency when recording a receipt.",
    inputSchema: {
      ...pagination,
      customerId: id.optional(),
      currency: currency.optional(),
      overdueOnly: z.boolean().default(false),
    },
    readOnly: true,
  }, async (input) => {
    const today = todayInTimeZone(context.business.timezone);
    const totals = db.selectFrom("payments").select("invoice_id")
      .select(sql<number>`sum(coalesce(applied_amount_cents, amount_cents))`.as("paid_cents"))
      .where("business_id", "=", businessId).groupBy("invoice_id").as("payment_totals");
    const paid = sql<number>`coalesce(${sql.ref("payment_totals.paid_cents")}, 0)`;
    let query = db.selectFrom("invoices")
      .leftJoin(totals, "payment_totals.invoice_id", "invoices.id")
      .where("invoices.business_id", "=", businessId)
      .where("invoices.lifecycle", "=", "issued")
      .where("invoices.invoice_number", "is not", null)
      .where(sql<boolean>`${paid} < ${sql.ref("invoices.total_cents")}`);
    if (input.customerId) query = query.where("invoices.customer_id", "=", input.customerId);
    if (input.currency) query = query.where("invoices.currency", "=", input.currency);
    if (input.overdueOnly) query = query.where("invoices.due_date", "<", today);
    const [rows, count] = await Promise.all([
      query.select([
        "invoices.id", "invoices.invoice_number as invoiceNumber",
        "invoices.customer_id as customerId", "invoices.customer_name as customerName",
        "invoices.currency", "invoices.total_cents as totalCents", "invoices.due_date as dueDate",
      ]).select(paid.as("paidCents"))
        .orderBy("invoices.created_at", "desc").orderBy("invoices.id", "desc")
        .limit(input.pageSize).offset((input.page - 1) * input.pageSize).execute(),
      query.select(({ fn }) => fn.countAll<number>().as("total")).executeTakeFirstOrThrow(),
    ]);
    const invoices = rows.map((row) => {
      const paidCents = Number(row.paidCents);
      return {
        ...row,
        paidCents,
        balanceDueCents: invoiceBalance(row.totalCents, paidCents),
        status: deriveInvoiceStatus({ ...row, paidCents, lifecycle: "issued", today }),
      };
    });
    return { invoices, ...pageResult(Number(count.total), input.page, input.pageSize) };
  });
}
