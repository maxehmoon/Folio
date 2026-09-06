import "server-only";

import { calculateLine, calculateInvoiceTotals } from "@/lib/finance/money";
import { db } from "@/lib/db";

import type {
  RecurringEditorCustomer,
  RecurringEditorItem,
  RecurringInvoiceDetail,
  RecurringInvoiceListRow,
} from "./types";

const maximumListRows = 500;

export async function listRecurringInvoices(
  businessId: string,
): Promise<RecurringInvoiceListRow[]> {
  const recurringInvoices = await db
    .selectFrom("recurring_invoices as recurring")
    .innerJoin("customers as customer", "customer.id", "recurring.customer_id")
    .select([
      "recurring.id",
      "recurring.state",
      "recurring.frequency",
      "recurring.interval_count",
      "recurring.start_date",
      "recurring.end_date",
      "recurring.next_issue_date",
      "recurring.currency",
      "recurring.created_at",
      "customer.id as customerId",
      "customer.name as customerName",
    ])
    .where("recurring.business_id", "=", businessId)
    .where("customer.business_id", "=", businessId)
    .orderBy("recurring.next_issue_date", "asc")
    .orderBy("recurring.created_at", "desc")
    .limit(maximumListRows)
    .execute();

  if (recurringInvoices.length === 0) return [];

  const lines = await db
    .selectFrom("recurring_invoice_lines")
    .select([
      "recurring_invoice_id",
      "quantity_thousandths",
      "unit_price_cents",
      "tax_rate_bps",
    ])
    .where("business_id", "=", businessId)
    .where(
      "recurring_invoice_id",
      "in",
      recurringInvoices.map((invoice) => invoice.id),
    )
    .execute();

  const lineTotals = new Map<string, ReturnType<typeof calculateLine>[]>();
  for (const line of lines) {
    const current = lineTotals.get(line.recurring_invoice_id) ?? [];
    current.push(
      calculateLine({
        quantityThousandths: line.quantity_thousandths,
        unitPriceCents: line.unit_price_cents,
        taxRateBps: line.tax_rate_bps,
      }),
    );
    lineTotals.set(line.recurring_invoice_id, current);
  }

  return recurringInvoices.map((invoice) => ({
    ...invoice,
    totalCents: calculateInvoiceTotals(lineTotals.get(invoice.id) ?? [])
      .totalCents,
  }));
}

export async function getRecurringInvoiceDetail(
  businessId: string,
  recurringInvoiceId: string,
): Promise<RecurringInvoiceDetail | null> {
  const recurringInvoice = await db
    .selectFrom("recurring_invoices")
    .selectAll()
    .where("business_id", "=", businessId)
    .where("id", "=", recurringInvoiceId)
    .executeTakeFirst();

  if (!recurringInvoice) return null;

  const lines = await db
    .selectFrom("recurring_invoice_lines")
    .selectAll()
    .where("business_id", "=", businessId)
    .where("recurring_invoice_id", "=", recurringInvoiceId)
    .orderBy("position", "asc")
    .execute();

  return { recurringInvoice, lines };
}

export async function getRecurringEditorOptions(
  businessId: string,
  current: { customerId?: string; itemIds?: string[] } = {},
): Promise<{
  customers: RecurringEditorCustomer[];
  items: RecurringEditorItem[];
}> {
  let customersQuery = db
    .selectFrom("customers")
    .select(["id", "name", "email", "avatar_data_url"])
    .where("business_id", "=", businessId);
  customersQuery = current.customerId
    ? customersQuery.where((expression) =>
        expression.or([
          expression("archived_at", "is", null),
          expression("id", "=", current.customerId!),
        ]),
      )
    : customersQuery.where("archived_at", "is", null);

  let itemsQuery = db
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
    .where("business_id", "=", businessId);
  const itemIds = current.itemIds?.filter(Boolean) ?? [];
  itemsQuery = itemIds.length > 0
    ? itemsQuery.where((expression) =>
        expression.or([
          expression("archived_at", "is", null),
          expression("id", "in", itemIds),
        ]),
      )
    : itemsQuery.where("archived_at", "is", null);

  const [customers, items] = await Promise.all([
    customersQuery.orderBy("name", "asc").execute(),
    itemsQuery.orderBy("name", "asc").execute(),
  ]);

  return { customers, items };
}
