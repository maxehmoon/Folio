import type { Metadata } from "next"

import { createItemAction } from "@/features/items/actions"
import { ItemForm } from "@/features/items/item-form"
import { PageHeader } from "@/components/folio/page-header"
import { requireBusiness } from "@/lib/session"

export const metadata: Metadata = { title: "New item" }

export default async function NewItemPage() {
  const business = await requireBusiness()

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Items", href: "/items" },
            { label: "New item" },
          ]}
          title="New item"
          description="Save a product or service to reuse on invoices."
        />
      </div>

      <ItemForm
        action={createItemAction}
        cancelHref="/items"
        initialValues={{
          currency: business.currency,
          description: "",
          name: "",
          taxRate: "0.00",
          unit: "item",
          unitPrice: "0.00",
        }}
        submitLabel="Create item"
      />
    </div>
  )
}
