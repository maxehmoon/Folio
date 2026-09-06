"use server"

import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"

import { db, newId, nowIso } from "@/lib/db"
import type { ItemUpdate, NewItem } from "@/lib/db/types"
import { requireBusiness } from "@/lib/session"

import {
  itemFormSchema,
  itemIdSchema,
  readItemFormValues,
  type ItemFormState,
  type ItemFormValues,
} from "./schema"

function validationError(
  values: ItemFormValues,
  fieldErrors: ItemFormState["fieldErrors"],
): ItemFormState {
  return {
    fieldErrors,
    message: "Check the highlighted fields and try again.",
    values,
  }
}

export async function createItemAction(
  _previousState: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const business = await requireBusiness()
  const values = readItemFormValues(formData)
  const parsed = itemFormSchema.safeParse(values)

  if (!parsed.success) {
    return validationError(values, parsed.error.flatten().fieldErrors)
  }

  const timestamp = nowIso()
  const item: NewItem = {
    archived_at: null,
    business_id: business.id,
    created_at: timestamp,
    currency: parsed.data.currency,
    description: parsed.data.description,
    id: newId(),
    name: parsed.data.name,
    tax_rate_bps: parsed.data.taxRate,
    unit: parsed.data.unit,
    unit_price_cents: parsed.data.unitPrice,
    updated_at: timestamp,
  }

  await db.insertInto("items").values(item).executeTakeFirstOrThrow()

  revalidatePath("/items")
  redirect(`/items/${item.id}`)
}

export async function updateItemAction(
  itemId: string,
  _previousState: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const business = await requireBusiness()
  const parsedId = itemIdSchema.safeParse(itemId)

  if (!parsedId.success) {
    return {
      message: "This item is no longer available.",
    }
  }

  const values = readItemFormValues(formData)
  const parsed = itemFormSchema.safeParse(values)

  if (!parsed.success) {
    return validationError(values, parsed.error.flatten().fieldErrors)
  }

  const update: ItemUpdate = {
    currency: parsed.data.currency,
    description: parsed.data.description,
    name: parsed.data.name,
    tax_rate_bps: parsed.data.taxRate,
    unit: parsed.data.unit,
    unit_price_cents: parsed.data.unitPrice,
    updated_at: nowIso(),
  }
  const result = await db
    .updateTable("items")
    .set(update)
    .where("id", "=", parsedId.data)
    .where("business_id", "=", business.id)
    .executeTakeFirst()

  if (Number(result.numUpdatedRows) === 0) {
    return {
      message: "This item is no longer available.",
      values,
    }
  }

  revalidatePath("/items")
  revalidatePath(`/items/${parsedId.data}`)
  redirect(`/items/${parsedId.data}`)
}

export async function archiveItemAction(itemId: string): Promise<void> {
  const business = await requireBusiness()
  const parsedId = itemIdSchema.safeParse(itemId)

  if (!parsedId.success) redirect("/items")

  const timestamp = nowIso()

  const result = await db
    .updateTable("items")
    .set({ archived_at: timestamp, updated_at: timestamp })
    .where("id", "=", parsedId.data)
    .where("business_id", "=", business.id)
    .where("archived_at", "is", null)
    .executeTakeFirst()

  if (Number(result.numUpdatedRows) === 0) notFound()

  revalidatePath("/items")
  revalidatePath(`/items/${parsedId.data}`)
  redirect(`/items/${parsedId.data}`)
}

export async function restoreItemAction(itemId: string): Promise<void> {
  const business = await requireBusiness()
  const parsedId = itemIdSchema.safeParse(itemId)

  if (!parsedId.success) redirect("/items")

  const timestamp = nowIso()

  const result = await db
    .updateTable("items")
    .set({ archived_at: null, updated_at: timestamp })
    .where("id", "=", parsedId.data)
    .where("business_id", "=", business.id)
    .where("archived_at", "is not", null)
    .executeTakeFirst()

  if (Number(result.numUpdatedRows) === 0) notFound()

  revalidatePath("/items")
  revalidatePath(`/items/${parsedId.data}`)
  redirect(`/items/${parsedId.data}`)
}
