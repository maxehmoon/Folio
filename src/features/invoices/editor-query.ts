import "server-only";

import { db } from "@/lib/db";

import type { InvoiceEditorCustomer, InvoiceEditorItem } from "./types";

export async function getInvoiceEditorOptions(
  businessId: string,
  options: { includeCustomerId?: string | null } = {},
): Promise<{
  customers: InvoiceEditorCustomer[];
  items: InvoiceEditorItem[];
}> {
  let customerQuery = db
    .selectFrom("customers")
    .select([
      "id",
      "name",
      "email",
      "tax_id",
      "default_currency",
      "avatar_data_url",
    ])
    .where("business_id", "=", businessId);

  customerQuery = options.includeCustomerId
    ? customerQuery.where((expression) =>
        expression.or([
          expression("archived_at", "is", null),
          expression("id", "=", options.includeCustomerId!),
        ]),
      )
    : customerQuery.where("archived_at", "is", null);

  const [customers, items] = await Promise.all([
    customerQuery.orderBy("name", "asc").execute(),
    db
      .selectFrom("items")
      .select([
        "id",
        "name",
        "description",
        "unit",
        "unit_price_cents",
        "tax_rate_bps",
        "currency",
      ])
      .where("business_id", "=", businessId)
      .where("archived_at", "is", null)
      .orderBy("name", "asc")
      .execute(),
  ]);

  return { customers, items };
}
