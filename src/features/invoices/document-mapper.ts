import { invoiceStatusLabel } from "./calculations";
import type { InvoiceDocumentData } from "./document-data";
import type { InvoiceDetail } from "./types";

function splitAddress(address: string | null) {
  return (address ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function paymentDetailText(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trimEnd());
  const firstLine = lines[0]?.trim().toLowerCase().replace(/:$/, "");

  if (firstLine === "payment information" || firstLine === "payment details") {
    lines.shift();
  }

  return lines.join("\n").trim();
}

function documentStatus(detail: InvoiceDetail): InvoiceDocumentData["status"] {
  const label = invoiceStatusLabel(detail.status);

  switch (detail.status) {
    case "paid":
      return { label, tone: "paid" };
    case "overdue":
      return { label, tone: "danger" };
    case "partially_paid":
      return { label, tone: "warning" };
    default:
      return { label, tone: "neutral" };
  }
}

export function buildInvoiceDocumentData(
  detail: InvoiceDetail,
): InvoiceDocumentData {
  const { invoice, lines, payments } = detail;
  const paidAt =
    detail.status === "paid" && payments.length > 0
      ? payments.reduce(
          (latest, payment) =>
            payment.payment_date > latest ? payment.payment_date : latest,
          payments[0].payment_date,
        )
      : undefined;
  const paymentDetails = invoice.payment_instructions
    ? paymentDetailText(invoice.payment_instructions)
    : "";

  return {
    number: invoice.invoice_number ?? "DRAFT",
    currency: invoice.currency,
    seller: {
      name: invoice.seller_name,
      address: splitAddress(invoice.seller_address),
      ...(invoice.seller_email ? { email: invoice.seller_email } : {}),
      ...(invoice.seller_phone ? { phone: invoice.seller_phone } : {}),
      ...(invoice.seller_tax_id ? { taxId: invoice.seller_tax_id } : {}),
    },
    customer: {
      name: invoice.customer_billing_name ?? invoice.customer_name,
      address: splitAddress(invoice.customer_address),
      ...(invoice.customer_email ? { email: invoice.customer_email } : {}),
      ...(invoice.customer_phone ? { phone: invoice.customer_phone } : {}),
      ...(invoice.customer_tax_id ? { taxId: invoice.customer_tax_id } : {}),
    },
    issuedAt: invoice.issue_date ?? invoice.created_at.slice(0, 10),
    ...(invoice.due_date ? { dueAt: invoice.due_date } : {}),
    ...(paidAt ? { paidAt } : {}),
    status: documentStatus(detail),
    lines: lines.map((line) => ({
      id: line.id,
      description: line.description,
      ...(line.details ? { details: line.details } : {}),
      quantity: line.quantity_thousandths / 1_000,
      unit: line.unit,
      unitPrice: line.unit_price_cents,
      amount: line.subtotal_cents,
    })),
    subtotal: invoice.subtotal_cents,
    tax: invoice.tax_cents,
    total: invoice.total_cents,
    amountPaid: detail.paidCents,
    balanceDue: detail.balanceDueCents,
    ...(invoice.notes ? { notes: invoice.notes } : {}),
    ...(paymentDetails
      ? { paymentDetails: { lines: paymentDetails.split("\n") } }
      : {}),
    contact: {
      email: invoice.seller_email ?? undefined,
      phone: invoice.seller_phone ?? undefined,
    },
    footer: {
      brand: invoice.seller_name,
      ...(invoice.invoice_footer ? { message: invoice.invoice_footer } : {}),
    },
  };
}
