import type { Metadata } from "next";

import { requireBusiness } from "@/lib/session";
import { createCustomer } from "@/features/customers/actions";
import { CustomerForm } from "@/features/customers/customer-form";
import { PageHeader } from "@/components/folio/page-header";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireBusiness();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Customers", href: "/customers" },
            { label: "New customer" },
          ]}
          title="New customer"
          description="Add the billing details you will use on invoices."
        />
      </div>

      <CustomerForm action={createCustomer} cancelHref="/customers" />
    </div>
  );
}
