import "server-only";

import { db, todayIso } from "@/lib/db";
import { invoiceBalance } from "@/lib/finance/money";

import { deriveInvoiceStatus } from "./calculations";
import type { InvoiceDetail } from "./types";

export async function getInvoiceDetail(
  businessId: string,
  invoiceId: string,
  today = todayIso(),
): Promise<InvoiceDetail | null> {
  const invoice = await db
    .selectFrom("invoices")
    .selectAll()
    .where("business_id", "=", businessId)
    .where("id", "=", invoiceId)
    .executeTakeFirst();

  if (!invoice) return null;

  const [lines, payments] = await Promise.all([
    db
      .selectFrom("invoice_lines")
      .selectAll()
      .where("business_id", "=", businessId)
      .where("invoice_id", "=", invoiceId)
      .orderBy("position", "asc")
      .execute(),
    db
      .selectFrom("payments")
      .selectAll()
      .where("business_id", "=", businessId)
      .where("invoice_id", "=", invoiceId)
      .orderBy("payment_date", "desc")
      .orderBy("created_at", "desc")
      .execute(),
  ]);
  const paidCents = payments.reduce(
    (total, payment) => total + payment.amount_cents,
    0,
  );

  return {
    invoice,
    lines,
    payments,
    paidCents,
    balanceDueCents: invoiceBalance(invoice.total_cents, paidCents),
    status: deriveInvoiceStatus({
      lifecycle: invoice.lifecycle,
      totalCents: invoice.total_cents,
      paidCents,
      dueDate: invoice.due_date,
      today,
    }),
  };
}
