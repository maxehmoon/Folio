import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { updateItemAction } from "@/features/items/actions"
import { ItemForm } from "@/features/items/item-form"
import { itemFormValues } from "@/features/items/presentation"
import { getItem } from "@/features/items/queries"
import { PageHeader } from "@/components/folio/page-header"

export const metadata: Metadata = { title: "Edit item" }

type EditItemPageProps = {
  params: Promise<{ id: string }>
}

export default async function EditItemPage({ params }: EditItemPageProps) {
  const { id } = await params
  const item = await getItem(id)

  if (!item) notFound()

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Items", href: "/items" },
            { label: item.name, href: `/items/${item.id}` },
            { label: "Edit" },
          ]}
          title="Edit item"
          description="Changes apply when you add this item to future invoices."
        />
      </div>

      <ItemForm
        action={updateItemAction.bind(null, item.id)}
        cancelHref={`/items/${item.id}`}
        initialValues={itemFormValues(item)}
        submitLabel="Save changes"
      />
    </div>
  )
}
