import "server-only";

import { db } from "@/lib/db";

import type { InvoiceDetail } from "./types";

export async function getInvoiceRevision(businessId: string, invoiceId: string, revisionId: string) {
  const revision = await db.selectFrom("invoice_revisions").selectAll()
    .where("business_id", "=", businessId)
    .where("invoice_id", "=", invoiceId)
    .where("id", "=", revisionId)
    .executeTakeFirst();
  return revision ? { ...revision, detail: JSON.parse(revision.snapshot) as InvoiceDetail } : null;
}
