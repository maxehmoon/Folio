import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/folio/page-header";
import { updateInvoiceAction } from "@/features/invoices/actions";
import { formatQuantity } from "@/features/invoices/calculations";
import { InvoiceEditor } from "@/features/invoices/invoice-editor";
import {
  getInvoiceDetail,
  getInvoiceEditorOptions,
} from "@/features/invoices/queries";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "Edit invoice" };

type EditInvoicePageProps = {
  params: Promise<{ id: string }>;
};

function inputDecimal(value: number, scale: number, digits: number) {
  return (value / scale).toFixed(digits).replace(/\.?0+$/, "");
}

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const [business, { id }] = await Promise.all([requireBusiness(), params]);
  const detail = await getInvoiceDetail(business.id, id);
  if (!detail || detail.invoice.lifecycle !== "draft") notFound();
  const options = await getInvoiceEditorOptions(
    business.id,
    { includeCustomerId: detail.invoice.customer_id },
  );
  const activeItemIds = new Set(options.items.map((item) => item.id));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Invoices", href: "/invoices" },
          { label: "Draft invoice", href: `/invoices/${id}` },
          { label: "Edit" },
        ]}
        title="Edit invoice"
        description="Changes update this draft’s customer snapshot and totals."
      />

      <InvoiceEditor
        action={updateInvoiceAction}
        baseCurrency={business.currency}
        cancelHref={`/invoices/${id}`}
        customers={options.customers}
        initialValues={{
          customerId: detail.invoice.customer_id ?? "",
          currency: detail.invoice.currency,
          issueDate: detail.invoice.issue_date ?? "",
          dueDate: detail.invoice.due_date ?? "",
          notes: detail.invoice.notes ?? "",
          paymentInstructions: detail.invoice.payment_instructions ?? "",
          lines: detail.lines.map((line) => ({
            key: line.id,
            itemId:
              line.item_id && activeItemIds.has(line.item_id) ? line.item_id : null,
            description: line.description,
            unit: line.unit,
            quantity: formatQuantity(line.quantity_thousandths),
            unitPrice: (line.unit_price_cents / 100).toFixed(2),
            taxRate: inputDecimal(line.tax_rate_bps, 100, 2),
          })),
        }}
        invoiceId={id}
        items={options.items}
      />
    </div>
  );
}
