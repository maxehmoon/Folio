import "server-only";

import { cache } from "react";
import { sql } from "kysely";

import type { Customer } from "@/lib/db/types";
import { db, getDatabaseDialect } from "@/lib/db";
import { likeContainsPattern } from "@/lib/db/like";
import { requireBusiness } from "@/lib/session";
import { listCustomerInvoices } from "@/features/invoices/queries";
import type { InvoiceListRow } from "@/features/invoices/types";
import { todayInTimeZone } from "@/lib/format";
import { convertToBaseCurrency } from "@/lib/finance/exchange";
import {
  customerIdSchema,
  type CustomerListFilters,
} from "@/features/customers/schema";

export type CustomerListResult = {
  customers: (Pick<
    Customer,
    | "id"
    | "name"
    | "avatar_data_url"
    | "contact_name"
    | "email"
    | "phone"
    | "country_code"
    | "archived_at"
    | "updated_at"
  > & {
    invoiceCount: number;
    invoicedCents: number;
    amountDueCents: number;
  })[];
  summary: {
    activeCustomers: number;
    newCustomers: number;
    invoicedCents: number;
    amountDueCents: number;
    currency: string;
  };
  total: number;
  totalPages: number;
};

function customerListQuery(businessId: string, filters: CustomerListFilters) {
  let query = db
    .selectFrom("customers")
    .where("business_id", "=", businessId);

  if (filters.status === "active") {
    query = query.where("archived_at", "is", null);
  } else if (filters.status === "archived") {
    query = query.where("archived_at", "is not", null);
  }

  if (filters.q) {
    const pattern = likeContainsPattern(filters.q);
    query = query.where(
      getDatabaseDialect() === "postgres"
        ? sql<boolean>`(
            coalesce(${sql.ref("customers.name")}, '') ilike ${pattern} escape '!'
            or coalesce(${sql.ref("customers.billing_name")}, '') ilike ${pattern} escape '!'
            or coalesce(${sql.ref("customers.contact_name")}, '') ilike ${pattern} escape '!'
            or coalesce(${sql.ref("customers.email")}, '') ilike ${pattern} escape '!'
            or coalesce(${sql.ref("customers.phone")}, '') ilike ${pattern} escape '!'
          )`
        : sql<boolean>`(
            coalesce(${sql.ref("customers.name")}, '') like ${pattern} escape '!'
            or coalesce(${sql.ref("customers.billing_name")}, '') like ${pattern} escape '!'
            or coalesce(${sql.ref("customers.contact_name")}, '') like ${pattern} escape '!'
            or coalesce(${sql.ref("customers.email")}, '') like ${pattern} escape '!'
            or coalesce(${sql.ref("customers.phone")}, '') like ${pattern} escape '!'
          )`,
    );
  }

  return query;
}

export async function listCustomers(
  filters: CustomerListFilters,
): Promise<CustomerListResult> {
  const business = await requireBusiness();
  const query = customerListQuery(business.id, filters);
  const offset = (filters.page - 1) * filters.limit;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000).toISOString();
  const paymentTotals = db
    .selectFrom("payments")
    .select("invoice_id")
    .select(sql<number>`sum(coalesce(applied_amount_cents, amount_cents))`.as("paid_cents"))
    .where("business_id", "=", business.id)
    .groupBy("invoice_id")
    .as("payment_totals");
  const paidCents = sql<number>`coalesce(${sql.ref("payment_totals.paid_cents")}, 0)`;
  const convertedTotal = sql<number>`case
    when ${sql.ref("invoices.currency")} = ${business.currency} then ${sql.ref("invoices.total_cents")}
    when ${sql.ref("invoices.base_currency")} = ${business.currency} and coalesce(${sql.ref("invoices.exchange_rate_micros")}, 0) > 0
      then cast((${sql.ref("invoices.total_cents")} * ${sql.ref("invoices.exchange_rate_micros")} + 500000) / 1000000 as integer)
    else 0 end`;
  const convertedBalance = sql<number>`case
    when ${sql.ref("invoices.currency")} = ${business.currency}
      then case when ${sql.ref("invoices.total_cents")} > ${paidCents} then ${sql.ref("invoices.total_cents")} - ${paidCents} else 0 end
    when ${sql.ref("invoices.base_currency")} = ${business.currency} and coalesce(${sql.ref("invoices.exchange_rate_micros")}, 0) > 0
      then cast((case when ${sql.ref("invoices.total_cents")} > ${paidCents} then ${sql.ref("invoices.total_cents")} - ${paidCents} else 0 end) * ${sql.ref("invoices.exchange_rate_micros")} / 1000000 as integer)
    else 0 end`;
  const invoiceMetrics = db
    .selectFrom("invoices")
    .leftJoin(paymentTotals, "payment_totals.invoice_id", "invoices.id")
    .select("invoices.customer_id")
    .select(({ fn }) => [
      fn.count<number>("invoices.id").as("invoice_count"),
      fn.sum<number>(convertedTotal).as("invoiced_cents"),
    ])
    .select(
      sql<number>`sum(${convertedBalance})`.as(
        "amount_due_cents",
      ),
    )
    .where("invoices.business_id", "=", business.id)
    .where("invoices.customer_id", "is not", null)
    .where("invoices.lifecycle", "=", "issued")
    .groupBy("invoices.customer_id")
    .as("invoice_metrics");

  const [customers, countResult, customerSummary, invoiceSummary] = await Promise.all([
    query
      .leftJoin(
        invoiceMetrics,
        "invoice_metrics.customer_id",
        "customers.id",
      )
      .select([
        "customers.id",
        "customers.name",
        "customers.avatar_data_url",
        "customers.contact_name",
        "customers.email",
        "customers.phone",
        "customers.country_code",
        "customers.archived_at",
        "customers.updated_at",
      ])
      .select([
        sql<number>`coalesce(${sql.ref("invoice_metrics.invoice_count")}, 0)`.as(
          "invoice_count",
        ),
        sql<number>`coalesce(${sql.ref("invoice_metrics.invoiced_cents")}, 0)`.as(
          "invoiced_cents",
        ),
        sql<number>`coalesce(${sql.ref("invoice_metrics.amount_due_cents")}, 0)`.as(
          "amount_due_cents",
        ),
      ])
      .orderBy("customers.name", "asc")
      .limit(filters.limit)
      .offset(offset)
      .execute(),
    query
      .select((expression) => expression.fn.countAll().as("count"))
      .executeTakeFirst(),
    db
      .selectFrom("customers")
      .select([
        sql<number>`sum(case when ${sql.ref("archived_at")} is null then 1 else 0 end)`.as(
          "active_customers",
        ),
        sql<number>`sum(case when ${sql.ref("archived_at")} is null and ${sql.ref("created_at")} >= ${ninetyDaysAgo} then 1 else 0 end)`.as(
          "new_customers",
        ),
      ])
      .where("business_id", "=", business.id)
      .executeTakeFirst(),
    db
      .selectFrom("invoices")
      .leftJoin(paymentTotals, "payment_totals.invoice_id", "invoices.id")
      .select([
        sql<number>`coalesce(sum(${convertedTotal}), 0)`.as(
          "invoiced_cents",
        ),
        sql<number>`coalesce(sum(${convertedBalance}), 0)`.as(
          "amount_due_cents",
        ),
      ])
      .where("invoices.business_id", "=", business.id)
      .where("invoices.lifecycle", "=", "issued")
      .executeTakeFirst(),
  ]);

  const total = Number(countResult?.count ?? 0);

  return {
    customers: customers.map((customer) => {
      const { amount_due_cents, invoice_count, invoiced_cents, ...record } = customer;

      return {
        ...record,
        invoiceCount: Number(invoice_count),
        invoicedCents: Number(invoiced_cents),
        amountDueCents: Number(amount_due_cents),
      };
    }),
    summary: {
      activeCustomers: Number(customerSummary?.active_customers ?? 0),
      newCustomers: Number(customerSummary?.new_customers ?? 0),
      invoicedCents: Number(invoiceSummary?.invoiced_cents ?? 0),
      amountDueCents: Number(invoiceSummary?.amount_due_cents ?? 0),
      currency: business.currency,
    },
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export const getCustomer = cache(async function getCustomer(
  customerId: string,
): Promise<Customer | undefined> {
  const business = await requireBusiness();
  const parsedId = customerIdSchema.safeParse(customerId);

  if (!parsedId.success) {
    return undefined;
  }

  return db
    .selectFrom("customers")
    .selectAll()
    .where("id", "=", parsedId.data)
    .where("business_id", "=", business.id)
    .executeTakeFirst();
});

export type CustomerWorkspace = {
  customer: Customer;
  invoices: InvoiceListRow[];
  summary: {
    amountDueCents: number;
    invoiceCount: number;
    invoicedCents: number;
    paidCents: number;
    currency: string;
  };
};

export const getCustomerWorkspace = cache(async function getCustomerWorkspace(
  customerId: string,
): Promise<CustomerWorkspace | undefined> {
  const business = await requireBusiness();
  const parsedId = customerIdSchema.safeParse(customerId);

  if (!parsedId.success) return undefined;
  const today = todayInTimeZone(business.timezone);

  const [customer, invoices] = await Promise.all([
    db
      .selectFrom("customers")
      .selectAll()
      .where("id", "=", parsedId.data)
      .where("business_id", "=", business.id)
      .executeTakeFirst(),
    listCustomerInvoices(business.id, parsedId.data, today),
  ]);

  if (!customer) return undefined;
  const summaryInvoices = invoices.filter(
    (invoice) => invoice.lifecycle === "issued",
  );
  const inBusinessCurrency = (amountCents: number, invoice: InvoiceListRow) => {
    const converted = convertToBaseCurrency({
      amountCents,
      currency: invoice.currency,
      baseCurrency: business.currency,
      storedBaseCurrency: invoice.base_currency,
      rateMicros: invoice.exchange_rate_micros,
    });
    return converted.status === "converted" ? converted.amountCents : 0;
  };

  return {
    customer,
    invoices,
    summary: {
      amountDueCents: summaryInvoices.reduce(
        (total, invoice) =>
          total + inBusinessCurrency(invoice.balanceDueCents, invoice),
        0,
      ),
      invoiceCount: invoices.filter((invoice) => invoice.lifecycle !== "void").length,
      invoicedCents: summaryInvoices.reduce(
        (total, invoice) =>
          total + inBusinessCurrency(invoice.total_cents, invoice),
        0,
      ),
      paidCents: summaryInvoices.reduce(
        (total, invoice) =>
          total + inBusinessCurrency(invoice.paidCents, invoice),
        0,
      ),
      currency: business.currency,
    },
  };
});
