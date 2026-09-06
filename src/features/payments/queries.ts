import "server-only";

import { sql, type Kysely } from "kysely";

import { db, type Database } from "@/lib/db";
import { listPayableInvoiceRows } from "@/features/invoices/queries";
import { shiftIsoDate } from "@/lib/iso-date";

import type { PayableInvoice, PaymentListRow } from "./types";

export const PAYMENT_PAGE_SIZE = 25;

export type PaymentListResult = {
  payments: PaymentListRow[];
  summary: {
    recentCents: number;
    totalCents: number;
  };
  total: number;
  totalPages: number;
};

export async function listPayments(
  businessId: string,
  page: number,
  currency: string,
  today: string,
): Promise<PaymentListResult> {
  return listPaymentsWithDatabase(db, businessId, page, currency, today);
}

export async function listPaymentsWithDatabase(
  database: Kysely<Database>,
  businessId: string,
  page: number,
  currency: string,
  today: string,
): Promise<PaymentListResult> {
  const safePage = Math.max(1, Math.min(10_000, Math.trunc(page)));
  const query = database
    .selectFrom("payments")
    .innerJoin("invoices", (join) =>
      join
        .onRef("invoices.id", "=", "payments.invoice_id")
        .onRef("invoices.business_id", "=", "payments.business_id"),
    )
    .selectAll("payments")
    .select([
      "invoices.customer_id as customerId",
      "invoices.invoice_number as invoiceNumber",
      "invoices.customer_name as customerName",
    ])
    .where("payments.business_id", "=", businessId)
    .where("invoices.invoice_number", "is not", null);
  const thirtyDaysAgo = shiftIsoDate(today, -29);
  const [payments, countRow, summaryRow] = await Promise.all([
    query
      .orderBy("payments.payment_date", "desc")
      .orderBy("payments.created_at", "desc")
      .limit(PAYMENT_PAGE_SIZE)
      .offset((safePage - 1) * PAYMENT_PAGE_SIZE)
      .$narrowType<{ invoiceNumber: string }>()
      .execute(),
    query
      .clearSelect()
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow(),
    database
      .selectFrom("payments")
      .select([
        sql<number>`coalesce(sum(${sql.ref("amount_cents")}), 0)`.as("total_cents"),
        sql<number>`coalesce(sum(case when ${sql.ref("payment_date")} >= ${thirtyDaysAgo} then ${sql.ref("amount_cents")} else 0 end), 0)`.as("recent_cents"),
      ])
      .where("business_id", "=", businessId)
      .where("currency", "=", currency)
      .executeTakeFirst(),
  ]);
  const total = Number(countRow.count);

  return {
    payments,
    summary: {
      recentCents: Number(summaryRow?.recent_cents ?? 0),
      totalCents: Number(summaryRow?.total_cents ?? 0),
    },
    total,
    totalPages: Math.max(1, Math.ceil(total / PAYMENT_PAGE_SIZE)),
  };
}

export async function listPayableInvoices(
  businessId: string,
  today?: string,
): Promise<PayableInvoice[]> {
  const invoices = await listPayableInvoiceRows(businessId, today);

  return invoices.flatMap((invoice) => {
    if (
      invoice.lifecycle !== "issued" ||
      invoice.balanceDueCents <= 0 ||
      !invoice.invoice_number
    ) {
      return [];
    }

    return [
      {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerName: invoice.customer_name,
        currency: invoice.currency,
        balanceDueCents: invoice.balanceDueCents,
        status: invoice.status,
      },
    ];
  });
}
