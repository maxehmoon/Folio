import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { updateCustomer } from "@/features/customers/actions";
import { CustomerForm } from "@/features/customers/customer-form";
import { getCustomer } from "@/features/customers/queries";
import { PageHeader } from "@/components/folio/page-header";

export const metadata: Metadata = { title: "Edit customer" };

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  const { id } = await params;
  const customer = await getCustomer(id);

  if (!customer) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Customers", href: "/customers" },
            { label: customer.name, href: `/customers/${customer.id}` },
            { label: "Edit" },
          ]}
          title="Edit customer"
          description="Changes apply to future invoices only."
        />
      </div>

      <CustomerForm
        action={updateCustomer}
        cancelHref={`/customers/${customer.id}`}
        customer={customer}
      />
    </div>
  );
}
