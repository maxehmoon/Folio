"use server";

import { revalidatePath } from "next/cache";
import { sql } from "kysely";

import {
  ensurePaymentFitsBalance,
  PaymentFormError,
  parsePaymentFormData,
  type PaymentActionState,
} from "@/features/payments/forms";
import { db, newId, nowIso } from "@/lib/db";
import { requireBusiness } from "@/lib/session";
import { paymentExchangeSnapshot } from "./invoice-allocation";

export async function recordPaymentAction(
  _state: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const business = await requireBusiness();

  try {
    const input = parsePaymentFormData(formData);

    await db.transaction().execute(async (transaction) => {
      // A harmless row update serialises balance checks on both SQLite and
      // PostgreSQL, preventing two concurrent receipts from overpaying one invoice.
      const lock = await transaction
        .updateTable("invoices")
        .set({ updated_at: sql<string>`updated_at` })
        .where("id", "=", input.invoiceId)
        .where("business_id", "=", business.id)
        .where("lifecycle", "=", "issued")
        .executeTakeFirst();
      if (Number(lock.numUpdatedRows) !== 1) {
        throw new PaymentFormError("Choose an issued invoice");
      }

      const invoice = await transaction
        .selectFrom("invoices")
        .select([
          "id", "invoice_number", "lifecycle", "currency", "total_cents",
          "base_currency", "exchange_rate_micros", "exchange_rate_date", "exchange_rate_source",
        ])
        .where("id", "=", input.invoiceId)
        .where("business_id", "=", business.id)
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
        .where("business_id", "=", business.id)
        .where("invoice_id", "=", invoice.id)
        .executeTakeFirst();
      const paidCents = Number(total?.paid_cents ?? 0);
      const amountDueCents = Math.max(0, invoice.total_cents - paidCents);

      ensurePaymentFitsBalance(input.amountCents, amountDueCents);

      const timestamp = nowIso();
      await transaction
        .insertInto("payments")
        .values({
          id: newId(),
          business_id: business.id,
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
        })
        .execute();
    });

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${input.invoiceId}`);
    revalidatePath("/payments");
    revalidatePath("/");
    return { success: "Payment recorded" };
  } catch (error) {
    if (error instanceof PaymentFormError) return { error: error.message };
    throw error;
  }
}

export async function deletePaymentAction(formData: FormData) {
  const business = await requireBusiness();
  const value = formData.get("paymentId");
  if (typeof value !== "string" || !value.trim() || value.length > 100) return;

  const payment = await db
    .selectFrom("payments")
    .select(["id", "invoice_id"])
    .where("id", "=", value)
    .where("business_id", "=", business.id)
    .executeTakeFirst();
  if (!payment) return;

  await db
    .deleteFrom("payments")
    .where("id", "=", payment.id)
    .where("business_id", "=", business.id)
    .execute();

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${payment.invoice_id}`);
  revalidatePath("/payments");
  revalidatePath("/");
}
