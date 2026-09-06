import "server-only"

import { sql } from "kysely"

import { db, getDatabaseDialect } from "@/lib/db"
import { likeContainsPattern } from "@/lib/db/like"
import type { Item } from "@/lib/db/types"
import { requireBusiness } from "@/lib/session"

import { itemIdSchema, type ItemListSearch } from "./schema"

export type ItemListResult = {
  items: Item[]
  summary: {
    activeItems: number
    archivedItems: number
    currencies: number
  }
  pagination: {
    limit: number
    page: number
    total: number
    totalPages: number
  }
}

export async function listItems(filters: ItemListSearch): Promise<ItemListResult> {
  const business = await requireBusiness()
  const searchPattern = likeContainsPattern(filters.q)

  let filteredItems = db
    .selectFrom("items")
    .where("items.business_id", "=", business.id)

  if (filters.status === "active") {
    filteredItems = filteredItems.where("items.archived_at", "is", null)
  } else if (filters.status === "archived") {
    filteredItems = filteredItems.where("items.archived_at", "is not", null)
  }

  if (filters.currency) {
    filteredItems = filteredItems.where("items.currency", "=", filters.currency)
  }

  if (filters.q) {
    filteredItems = filteredItems.where(
      getDatabaseDialect() === "postgres"
        ? sql<boolean>`(
            ${sql.ref("items.name")} ilike ${searchPattern} escape '!'
            or coalesce(${sql.ref("items.description")}, '') ilike ${searchPattern} escape '!'
          )`
        : sql<boolean>`(
            ${sql.ref("items.name")} like ${searchPattern} escape '!'
            or coalesce(${sql.ref("items.description")}, '') like ${searchPattern} escape '!'
          )`,
    )
  }

  const offset = (filters.page - 1) * filters.limit
  const [items, totalRow, summaryRow] = await Promise.all([
    filteredItems
      .selectAll("items")
      .orderBy("items.name", "asc")
      .orderBy("items.created_at", "desc")
      .limit(filters.limit)
      .offset(offset)
      .execute(),
    filteredItems
      .select(({ fn }) => fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("items")
      .select([
        sql<number>`sum(case when ${sql.ref("archived_at")} is null then 1 else 0 end)`.as("active_items"),
        sql<number>`sum(case when ${sql.ref("archived_at")} is not null then 1 else 0 end)`.as("archived_items"),
        sql<number>`count(distinct ${sql.ref("currency")})`.as("currencies"),
      ])
      .where("items.business_id", "=", business.id)
      .executeTakeFirst(),
  ])

  const total = Number(totalRow.total)

  return {
    items,
    summary: {
      activeItems: Number(summaryRow?.active_items ?? 0),
      archivedItems: Number(summaryRow?.archived_items ?? 0),
      currencies: Number(summaryRow?.currencies ?? 0),
    },
    pagination: {
      limit: filters.limit,
      page: filters.page,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    },
  }
}

export async function getItem(itemId: string): Promise<Item | undefined> {
  const business = await requireBusiness()
  const parsedId = itemIdSchema.safeParse(itemId)

  if (!parsedId.success) return undefined

  return db
    .selectFrom("items")
    .selectAll("items")
    .where("items.id", "=", parsedId.data)
    .where("items.business_id", "=", business.id)
    .executeTakeFirst()
}
