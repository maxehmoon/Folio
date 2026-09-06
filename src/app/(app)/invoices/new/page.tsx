import type { Metadata } from "next";

import { PageHeader } from "@/components/folio/page-header";
import { createInvoiceAction } from "@/features/invoices/actions";
import { InvoiceEditor } from "@/features/invoices/invoice-editor";
import { getInvoiceEditorOptions } from "@/features/invoices/queries";
import { todayInTimeZone } from "@/lib/format";
import { addPaymentTerms } from "@/lib/finance";
import { requireBusiness } from "@/lib/session";

export const metadata: Metadata = { title: "New invoice" };

type NewInvoicePageProps = {
  searchParams: Promise<{ customerId?: string }>;
};

export default async function NewInvoicePage({ searchParams }: NewInvoicePageProps) {
  const business = await requireBusiness();
  const { customerId: requestedCustomerId } = await searchParams;
  const { customers, items } = await getInvoiceEditorOptions(business.id);
  const selectedCustomer = customers.find(
    (customer) => customer.id === requestedCustomerId,
  );
  const today = todayInTimeZone(business.timezone);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Invoices", href: "/invoices" },
          { label: "New invoice" },
        ]}
        title="New invoice"
        description="Add the customer and line items, then save or issue the invoice."
      />

      <InvoiceEditor
        action={createInvoiceAction}
        baseCurrency={business.currency}
        cancelHref="/invoices"
        customers={customers}
        initialValues={{
          customerId: selectedCustomer?.id ?? "",
          currency: selectedCustomer?.default_currency ?? business.currency,
          issueDate: today,
          dueDate: addPaymentTerms(today, business.default_payment_terms_days),
          notes: "",
          paymentInstructions: business.payment_instructions ?? "",
          lines: [
            {
              key: "new-line-1",
              itemId: null,
              description: "",
              unit: "each",
              quantity: "1",
              unitPrice: "0.00",
              taxRate: "0",
            },
          ],
        }}
        items={items}
      />
    </div>
  );
}
