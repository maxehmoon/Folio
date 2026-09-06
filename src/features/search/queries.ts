import "server-only";

import { sql, type Kysely } from "kysely";

import { paymentMethodLabels } from "@/features/payments/types";
import { db, type Database } from "@/lib/db";
import { likeContainsPattern } from "@/lib/db/like";
import { formatDate, formatMoney } from "@/lib/format";

import type { FolioSearchGroup } from "./types";

const RESULT_LIMIT = 6;

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function recurringDescription(
  frequency: "day" | "week" | "month" | "year",
  interval: number,
  nextIssueDate: string,
): string {
  const period = interval === 1 ? frequency : `${frequency}s`;
  return `Every ${interval === 1 ? "" : `${interval} `}${period} · Next ${formatDate(nextIssueDate)}`;
}

async function searchCustomers(
  database: Kysely<Database>,
  businessId: string,
  pattern: string,
): Promise<FolioSearchGroup> {
  const customers = await database
    .selectFrom("customers")
    .select(["id", "name", "contact_name", "email", "archived_at"])
    .where("business_id", "=", businessId)
    .where(
      sql<boolean>`(
        lower(${sql.ref("name")}) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("contact_name")}, '')) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("email")}, '')) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("phone")}, '')) like ${pattern} escape '!'
      )`,
    )
    .orderBy("archived_at", "asc")
    .orderBy("name", "asc")
    .limit(RESULT_LIMIT)
    .execute();

  return {
    key: "customer",
    label: "Customers",
    results: customers.map((customer) => {
      const details = [customer.contact_name, customer.email].filter(
        (value) => value && value.toLowerCase() !== customer.name.toLowerCase(),
      );
      return {
        badge: customer.archived_at ? "Archived" : undefined,
        description: details.join(" · ") || "Customer",
        href: `/customers/${customer.id}`,
        id: customer.id,
        title: customer.name,
        type: "customer",
      };
    }),
  };
}

async function searchInvoices(
  database: Kysely<Database>,
  businessId: string,
  pattern: string,
): Promise<FolioSearchGroup> {
  const invoices = await database
    .selectFrom("invoices")
    .select([
      "id",
      "invoice_number",
      "customer_name",
      "lifecycle",
      "issue_date",
      "total_cents",
      "currency",
    ])
    .where("business_id", "=", businessId)
    .where(
      sql<boolean>`(
        lower(coalesce(${sql.ref("invoice_number")}, '')) like ${pattern} escape '!'
        or lower(${sql.ref("customer_name")}) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("customer_email")}, '')) like ${pattern} escape '!'
      )`,
    )
    .orderBy("updated_at", "desc")
    .limit(RESULT_LIMIT)
    .execute();

  return {
    key: "invoice",
    label: "Invoices",
    results: invoices.map((invoice) => ({
      badge: titleCase(invoice.lifecycle),
      description: `${invoice.customer_name} · ${formatMoney(invoice.total_cents, invoice.currency)}${invoice.issue_date ? ` · ${formatDate(invoice.issue_date)}` : ""}`,
      href: `/invoices/${invoice.id}`,
      id: invoice.id,
      title: invoice.invoice_number ?? "Draft invoice",
      type: "invoice",
    })),
  };
}

async function searchRecurringInvoices(
  database: Kysely<Database>,
  businessId: string,
  pattern: string,
): Promise<FolioSearchGroup> {
  const recurring = await database
    .selectFrom("recurring_invoices as recurring")
    .innerJoin("customers as customer", (join) =>
      join
        .onRef("customer.id", "=", "recurring.customer_id")
        .onRef("customer.business_id", "=", "recurring.business_id"),
    )
    .select([
      "recurring.id",
      "recurring.state",
      "recurring.frequency",
      "recurring.interval_count",
      "recurring.next_issue_date",
      "customer.name as customer_name",
    ])
    .where("recurring.business_id", "=", businessId)
    .where(
      sql<boolean>`(
        lower(${sql.ref("customer.name")}) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("customer.email")}, '')) like ${pattern} escape '!'
        or lower(${sql.ref("recurring.state")}) like ${pattern} escape '!'
        or lower(${sql.ref("recurring.frequency")}) like ${pattern} escape '!'
      )`,
    )
    .orderBy("recurring.next_issue_date", "asc")
    .limit(RESULT_LIMIT)
    .execute();

  return {
    key: "recurring",
    label: "Recurring invoices",
    results: recurring.map((invoice) => ({
      badge: titleCase(invoice.state),
      description: recurringDescription(
        invoice.frequency,
        invoice.interval_count,
        invoice.next_issue_date,
      ),
      href: `/recurring/${invoice.id}/edit`,
      id: invoice.id,
      title: invoice.customer_name,
      type: "recurring",
    })),
  };
}

async function searchItems(
  database: Kysely<Database>,
  businessId: string,
  pattern: string,
): Promise<FolioSearchGroup> {
  const items = await database
    .selectFrom("items")
    .select([
      "id",
      "name",
      "description",
      "unit",
      "unit_price_cents",
      "currency",
      "archived_at",
    ])
    .where("business_id", "=", businessId)
    .where(
      sql<boolean>`(
        lower(${sql.ref("name")}) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("description")}, '')) like ${pattern} escape '!'
        or lower(${sql.ref("unit")}) like ${pattern} escape '!'
      )`,
    )
    .orderBy("archived_at", "asc")
    .orderBy("name", "asc")
    .limit(RESULT_LIMIT)
    .execute();

  return {
    key: "item",
    label: "Items",
    results: items.map((item) => ({
      badge: item.archived_at ? "Archived" : undefined,
      description: `${formatMoney(item.unit_price_cents, item.currency)} per ${item.unit}${item.description ? ` · ${item.description}` : ""}`,
      href: `/items/${item.id}`,
      id: item.id,
      title: item.name,
      type: "item",
    })),
  };
}

async function searchPayments(
  database: Kysely<Database>,
  businessId: string,
  pattern: string,
): Promise<FolioSearchGroup> {
  const payments = await database
    .selectFrom("payments")
    .innerJoin("invoices", (join) =>
      join
        .onRef("invoices.id", "=", "payments.invoice_id")
        .onRef("invoices.business_id", "=", "payments.business_id"),
    )
    .select([
      "payments.id",
      "payments.invoice_id",
      "payments.payment_date",
      "payments.amount_cents",
      "payments.currency",
      "payments.method",
      "invoices.invoice_number",
      "invoices.customer_name",
    ])
    .where("payments.business_id", "=", businessId)
    .where(
      sql<boolean>`(
        lower(coalesce(${sql.ref("payments.reference")}, '')) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("invoices.invoice_number")}, '')) like ${pattern} escape '!'
        or lower(${sql.ref("invoices.customer_name")}) like ${pattern} escape '!'
        or lower(${sql.ref("payments.method")}) like ${pattern} escape '!'
      )`,
    )
    .orderBy("payments.payment_date", "desc")
    .limit(RESULT_LIMIT)
    .execute();

  return {
    key: "payment",
    label: "Payments",
    results: payments.map((payment) => ({
      badge: paymentMethodLabels[payment.method],
      description: `${payment.customer_name} · ${formatMoney(payment.amount_cents, payment.currency)} · ${formatDate(payment.payment_date)}`,
      href: `/invoices/${payment.invoice_id}`,
      id: payment.id,
      title: `Payment for ${payment.invoice_number ?? "draft invoice"}`,
      type: "payment",
    })),
  };
}

async function searchExpenses(
  database: Kysely<Database>,
  businessId: string,
  pattern: string,
): Promise<FolioSearchGroup> {
  const expenses = await database
    .selectFrom("expenses")
    .select([
      "id",
      "vendor",
      "category",
      "expense_date",
      "total_cents",
      "currency",
      "reference",
    ])
    .where("business_id", "=", businessId)
    .where(
      sql<boolean>`(
        lower(${sql.ref("vendor")}) like ${pattern} escape '!'
        or lower(${sql.ref("category")}) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("description")}, '')) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("reference")}, '')) like ${pattern} escape '!'
      )`,
    )
    .orderBy("expense_date", "desc")
    .limit(RESULT_LIMIT)
    .execute();

  return {
    key: "expense",
    label: "Expenses",
    results: expenses.map((expense) => ({
      badge: expense.category,
      description: `${formatMoney(expense.total_cents, expense.currency)} · ${formatDate(expense.expense_date)}${expense.reference ? ` · ${expense.reference}` : ""}`,
      href: `/expenses/${expense.id}`,
      id: expense.id,
      title: expense.vendor,
      type: "expense",
    })),
  };
}

export async function searchFolioWithDatabase(
  database: Kysely<Database>,
  businessId: string,
  query: string,
): Promise<FolioSearchGroup[]> {
  const pattern = likeContainsPattern(query.trim().toLowerCase());
  const groups = await Promise.all([
    searchCustomers(database, businessId, pattern),
    searchInvoices(database, businessId, pattern),
    searchRecurringInvoices(database, businessId, pattern),
    searchItems(database, businessId, pattern),
    searchPayments(database, businessId, pattern),
    searchExpenses(database, businessId, pattern),
  ]);
  return groups.filter((group) => group.results.length > 0);
}

export function searchFolio(
  businessId: string,
  query: string,
): Promise<FolioSearchGroup[]> {
  return searchFolioWithDatabase(db, businessId, query);
}
