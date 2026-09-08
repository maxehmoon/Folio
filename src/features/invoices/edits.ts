import { sql, type Kysely } from "kysely";

import { reallocateInvoicePayments } from "@/features/payments/invoice-allocation";
import { newId, type Business, type Database } from "@/lib/db";
import { todayInTimeZone } from "@/lib/format";
import { deriveInvoiceStatus, invoiceBalance } from "@/lib/finance/money";

import { replaceInvoiceAggregate, type PreparedInvoiceAggregate } from "./aggregate";
import { FormSubmissionError } from "./forms";
import type { InvoiceDetail } from "./types";

export async function editInvoice(
  database: Kysely<Database>,
  business: Business,
  aggregate: PreparedInvoiceAggregate,
  options: {
    expectedUpdatedAt: string;
    confirmed: boolean;
    refreshCustomerDetails: boolean;
    actorName: string;
  },
) {
  return database.transaction().execute(async (transaction) => {
    const lock = await transaction.updateTable("invoices")
      .set({ updated_at: sql<string>`updated_at` })
      .where("id", "=", aggregate.invoice.id)
      .where("business_id", "=", business.id)
      .where("updated_at", "=", options.expectedUpdatedAt)
      .executeTakeFirst();
    if (Number(lock.numUpdatedRows) !== 1 || aggregate.invoice.business_id !== business.id) {
      throw new FormSubmissionError("This invoice changed or is unavailable. Refresh the page before editing it.");
    }
    const original = await transaction.selectFrom("invoices").selectAll()
      .where("id", "=", aggregate.invoice.id).where("business_id", "=", business.id)
      .executeTakeFirstOrThrow();
    const timestamp = new Date(Math.max(Date.now(), Date.parse(original.updated_at) + 1)).toISOString();
    const next = { ...aggregate.invoice, updated_at: timestamp };

    if (original.lifecycle !== "draft") {
      if (!options.confirmed) {
        throw new FormSubmissionError("Acknowledge the warning before saving changes to a published invoice");
      }
      if (!next.issue_date) {
        throw new FormSubmissionError("An issued invoice must have an issue date");
      }
      // Preserve document details unless the user changes or explicitly refreshes the customer.
      Object.assign(next, {
        seller_name: original.seller_name,
        seller_email: original.seller_email,
        seller_phone: original.seller_phone,
        seller_tax_id: original.seller_tax_id,
        seller_address: original.seller_address,
        seller_country_code: original.seller_country_code,
        invoice_footer: original.invoice_footer,
      });
      if (next.customer_id === original.customer_id && !options.refreshCustomerDetails) {
        Object.assign(next, {
          customer_name: original.customer_name,
          customer_billing_name: original.customer_billing_name,
          customer_email: original.customer_email,
          customer_phone: original.customer_phone,
          customer_tax_id: original.customer_tax_id,
          customer_address: original.customer_address,
          customer_country_code: original.customer_country_code,
        });
      }
      const [lines, payments] = await Promise.all([
        transaction.selectFrom("invoice_lines").selectAll()
          .where("business_id", "=", business.id).where("invoice_id", "=", original.id)
          .orderBy("position").execute(),
        transaction.selectFrom("payments").selectAll()
          .where("business_id", "=", business.id).where("invoice_id", "=", original.id)
          .orderBy("payment_date", "desc").execute(),
      ]);
      const paidCents = payments.reduce((total, payment) => total + (payment.applied_amount_cents ?? payment.amount_cents), 0);
      const snapshot: InvoiceDetail = {
        invoice: original,
        lines,
        payments,
        paidCents,
        balanceDueCents: original.lifecycle === "void" ? 0 : invoiceBalance(original.total_cents, paidCents),
        status: deriveInvoiceStatus({
          lifecycle: original.lifecycle,
          totalCents: original.total_cents,
          paidCents,
          dueDate: original.due_date,
          today: todayInTimeZone(business.timezone),
        }),
      };
      await transaction.insertInto("invoice_revisions").values({
        id: newId(), business_id: business.id, invoice_id: original.id,
        actor_name: options.actorName, invoice_number: original.invoice_number,
        currency: original.currency, total_cents: original.total_cents,
        snapshot: JSON.stringify(snapshot), created_at: timestamp,
      }).execute();
      await reallocateInvoicePayments(transaction, original, next);
    }
    await replaceInvoiceAggregate(transaction, { invoice: next, lines: aggregate.lines }, original.lifecycle);
  });
}
