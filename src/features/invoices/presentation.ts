import type { InvoiceStatus } from "@/lib/db/types";

import type { StatusTone } from "@/components/folio/status-badge";

export function invoiceStatusTone(status: InvoiceStatus): StatusTone {
  if (status === "paid") return "success";
  if (status === "overdue") return "danger";
  if (status === "partially_paid") return "warning";
  if (status === "issued") return "info";
  if (status === "void") return "danger";
  return "neutral";
}
