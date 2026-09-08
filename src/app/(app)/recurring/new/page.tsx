import type { Metadata } from "next";

import { PageHeader } from "@/components/folio/page-header";
import { createRecurringInvoiceAction } from "@/features/recurring/actions";
import { getRecurringEditorOptions } from "@/features/recurring/queries";
import { RecurringEditor } from "@/features/recurring/recurring-editor";
import { todayIso } from "@/lib/db";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "New recurring invoice" };

export default async function NewRecurringInvoicePage() {
  const business = await requireBusiness();
  const options = await getRecurringEditorOptions(business.id);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Recurring", href: "/recurring" },
          { label: "New recurring invoice" },
        ]}
        title="New recurring invoice"
        description="Folio will issue an invoice on each scheduled date."
      />

      <RecurringEditor
        action={createRecurringInvoiceAction}
        cancelHref="/recurring"
        customers={options.customers}
        initialValues={{
          customerId: "",
          frequency: "month",
          intervalCount: "1",
          startsOn: todayIso(),
          endsOn: "",
          paymentTermsDays: String(business.default_payment_terms_days),
          currency: business.currency,
          notes: "",
          paymentInstructions: business.payment_instructions ?? "",
          lines: [
            {
              key: "new-recurring-line-1",
              itemId: null,
              description: "",
              details: "",
              unit: "each",
              quantity: "1",
              unitPrice: "0.00",
              taxRate: "0",
            },
          ],
        }}
        items={options.items}
        mode="create"
      />
    </div>
  );
}
