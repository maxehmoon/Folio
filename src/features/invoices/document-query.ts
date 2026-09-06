import "server-only";

import type { Business, InvoiceLifecycle } from "@/lib/db";
import { todayInTimeZone } from "@/lib/format";

import { buildInvoiceDocumentData } from "./document-mapper";
import { getInvoiceDetail } from "./queries";

export async function getInvoiceDocumentRecord(
  business: Business,
  invoiceId: string,
): Promise<
  | {
      lifecycle: InvoiceLifecycle;
      data: ReturnType<typeof buildInvoiceDocumentData>;
    }
  | null
> {
  const detail = await getInvoiceDetail(
    business.id,
    invoiceId,
    todayInTimeZone(business.timezone),
  );

  return detail
    ? {
        lifecycle: detail.invoice.lifecycle,
        data: buildInvoiceDocumentData(detail),
      }
    : null;
}
