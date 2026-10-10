import "server-only";

import { sql, type Kysely } from "kysely";

import { newId, nowIso, type Database, type Payment } from "@/lib/db";

import { ensurePaymentFitsBalance, PaymentFormError, type SubmittedPayment } from "./forms";
import { paymentExchangeSnapshot } from "./invoice-allocation";

export async function recordPayment(
  database: Kysely<Database>,
  businessId: string,
  input: SubmittedPayment,
): Promise<Payment> {
  return database.transaction().execute(async (transaction) => {
    // Serialise balance checks with invoice edits on both supported databases.
    const lock = await transaction
      .updateTable("invoices")
      .set({ updated_at: sql<string>`updated_at` })
      .where("id", "=", input.invoiceId)
      .where("business_id", "=", businessId)
      .where("lifecycle", "=", "issued")
      .executeTakeFirst();
    if (Number(lock.numUpdatedRows) !== 1) {
      throw new PaymentFormError("Choose an issued invoice");
    }

    const invoice = await transaction
      .selectFrom("invoices")
      .select([
        "id", "lifecycle", "currency", "total_cents", "base_currency",
        "exchange_rate_micros", "exchange_rate_date", "exchange_rate_source",
      ])
      .where("id", "=", input.invoiceId)
      .where("business_id", "=", businessId)
      .executeTakeFirst();
    if (!invoice || invoice.lifecycle !== "issued") {
      throw new PaymentFormError("Choose an issued invoice");
    }
    if (input.currency !== invoice.currency) {
      throw new PaymentFormError("The invoice currency has changed. Refresh the page before recording this payment.");
    }

    const total = await transaction
      .selectFrom("payments")
      .select(sql<number>`sum(coalesce(applied_amount_cents, amount_cents))`.as("paid_cents"))
      .where("business_id", "=", businessId)
      .where("invoice_id", "=", invoice.id)
      .executeTakeFirst();
    const paidCents = Number(total?.paid_cents ?? 0);
    ensurePaymentFitsBalance(input.amountCents, Math.max(0, invoice.total_cents - paidCents));

    const timestamp = nowIso();
    return transaction.insertInto("payments").values({
      id: newId(),
      business_id: businessId,
      invoice_id: invoice.id,
      payment_date: input.paymentDate,
      amount_cents: input.amountCents,
      currency: invoice.currency,
      applied_amount_cents: input.amountCents,
      ...paymentExchangeSnapshot(invoice),
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      created_at: timestamp,
      updated_at: timestamp,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function deletePayment(
  database: Kysely<Database>,
  businessId: string,
  paymentId: string,
): Promise<Payment | undefined> {
  return database.transaction().execute(async (transaction) => {
    // Use the same invoice lock as receipt recording and invoice editing.
    await transaction.updateTable("invoices")
      .set({ updated_at: sql<string>`updated_at` })
      .where("id", "in", transaction.selectFrom("payments").select("invoice_id")
        .where("id", "=", paymentId).where("business_id", "=", businessId))
      .where("business_id", "=", businessId)
      .execute();
    return transaction.deleteFrom("payments")
      .where("id", "=", paymentId).where("business_id", "=", businessId)
      .returningAll().executeTakeFirst();
  });
}
