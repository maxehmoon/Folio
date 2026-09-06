import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/folio/page-header";
import { formatQuantity } from "@/features/invoices/calculations";
import { updateRecurringInvoiceAction } from "@/features/recurring/actions";
import {
  getRecurringEditorOptions,
  getRecurringInvoiceDetail,
} from "@/features/recurring/queries";
import { RecurringEditor } from "@/features/recurring/recurring-editor";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "Edit recurring invoice" };

type EditRecurringInvoicePageProps = {
  params: Promise<{ id: string }>;
};

function inputDecimal(value: number, scale: number, digits: number): string {
  return (value / scale).toFixed(digits).replace(/\.?0+$/, "");
}

export default async function EditRecurringInvoicePage({
  params,
}: EditRecurringInvoicePageProps) {
  const [business, { id }] = await Promise.all([requireBusiness(), params]);
  const detail = await getRecurringInvoiceDetail(business.id, id);
  if (!detail) notFound();

  const options = await getRecurringEditorOptions(business.id, {
    customerId: detail.recurringInvoice.customer_id,
    itemIds: detail.lines.flatMap((line) => (line.item_id ? [line.item_id] : [])),
  });
  const activeItemIds = new Set(options.items.map((item) => item.id));
  const customerName =
    options.customers.find(
      (customer) => customer.id === detail.recurringInvoice.customer_id,
    )?.name ?? "Schedule";
  const action = updateRecurringInvoiceAction.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Recurring", href: "/recurring" },
          { label: customerName },
        ]}
        title="Edit recurring invoice"
        description="Changes apply to future invoices; previously issued invoices stay unchanged."
      />

      <RecurringEditor
        action={action}
        cancelHref="/recurring"
        customers={options.customers}
        initialValues={{
          customerId: detail.recurringInvoice.customer_id,
          frequency: detail.recurringInvoice.frequency,
          intervalCount: String(detail.recurringInvoice.interval_count),
          startsOn: detail.recurringInvoice.start_date,
          endsOn: detail.recurringInvoice.end_date ?? "",
          paymentTermsDays: String(detail.recurringInvoice.payment_terms_days),
          currency: detail.recurringInvoice.currency,
          notes: detail.recurringInvoice.notes ?? "",
          paymentInstructions:
            detail.recurringInvoice.payment_instructions ?? "",
          lines: detail.lines.map((line) => ({
            key: line.id,
            itemId:
              line.item_id && activeItemIds.has(line.item_id)
                ? line.item_id
                : null,
            description: line.description,
            unit: line.unit,
            quantity: formatQuantity(line.quantity_thousandths),
            unitPrice: (line.unit_price_cents / 100).toFixed(2),
            taxRate: inputDecimal(line.tax_rate_bps, 100, 2),
          })),
        }}
        items={options.items}
        mode="edit"
      />
    </div>
  );
}
