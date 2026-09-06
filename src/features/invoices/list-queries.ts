import "server-only";

import { sql } from "kysely";

import { db, todayIso } from "@/lib/db";
import { likeContainsPattern } from "@/lib/db/like";
import { invoiceBalance } from "@/lib/finance/money";

import { deriveInvoiceStatus } from "./calculations";
import {
  summariseInvoiceOverview,
  type InvoiceOverview,
} from "./overview";
import type { InvoiceListFilter, InvoiceListRow } from "./types";

const MAX_LIST_ROWS = 50;
export const INVOICE_PAGE_SIZE = 25;

export type InvoiceListResult = {
  invoices: InvoiceListRow[];
  total: number;
  totalPages: number;
};

function invoiceListQuery(
  businessId: string,
  options: {
    search?: string;
    status?: InvoiceListFilter;
    today?: string;
    payableOnly?: boolean;
    customerId?: string;
  },
) {
  const paymentTotals = db
    .selectFrom("payments")
    .select("invoice_id")
    .select(({ fn }) => fn.sum<number>("amount_cents").as("paid_cents"))
    .where("business_id", "=", businessId)
    .groupBy("invoice_id")
    .as("payment_totals");
  const paidCents = sql<number>`coalesce(${sql.ref("payment_totals.paid_cents")}, 0)`;
  const today = options.today ?? todayIso();
  const search = options.search?.trim();
  const status = options.status ?? "all";

  let query = db
    .selectFrom("invoices")
    .leftJoin(paymentTotals, "payment_totals.invoice_id", "invoices.id")
    .where("invoices.business_id", "=", businessId);

  if (options.customerId) {
    query = query.where("invoices.customer_id", "=", options.customerId);
  }

  if (search) {
    const pattern = likeContainsPattern(search.toLowerCase());
    query = query.where(
      sql<boolean>`(
        lower(${sql.ref("invoices.customer_name")}) like ${pattern} escape '!'
        or lower(coalesce(${sql.ref("invoices.invoice_number")}, '')) like ${pattern} escape '!'
      )`,
    );
  }

  if (status === "draft" || status === "void") {
    query = query.where("invoices.lifecycle", "=", status);
  } else if (status === "paid") {
    query = query
      .where("invoices.lifecycle", "=", "issued")
      .where(sql<boolean>`${paidCents} >= ${sql.ref("invoices.total_cents")}`);
  } else if (status === "overdue") {
    query = query
      .where("invoices.lifecycle", "=", "issued")
      .where(sql<boolean>`${paidCents} < ${sql.ref("invoices.total_cents")}`)
      .where("invoices.due_date", "is not", null)
      .where("invoices.due_date", "<", today);
  } else if (status === "outstanding" || status === "part-paid") {
    query = query
      .where("invoices.lifecycle", "=", "issued")
      .where(sql<boolean>`${paidCents} < ${sql.ref("invoices.total_cents")}`)
      .where((expression) =>
        expression.or([
          expression("invoices.due_date", "is", null),
          expression("invoices.due_date", ">=", today),
        ]),
      )
      .where(
        status === "outstanding"
          ? sql<boolean>`${paidCents} = 0`
          : sql<boolean>`${paidCents} > 0`,
      );
  }

  if (options.payableOnly) {
    query = query
      .where("invoices.lifecycle", "=", "issued")
      .where(sql<boolean>`${paidCents} < ${sql.ref("invoices.total_cents")}`);
  }

  return { paidCents, query };
}

function toInvoiceListRow(
  invoice: Omit<InvoiceListRow, "paidCents" | "balanceDueCents" | "status"> & {
    paid_cents: unknown;
  },
  today: string,
): InvoiceListRow {
  const { paid_cents, ...record } = invoice;
  const paidCents = Number(paid_cents);

  return {
    ...record,
    paidCents,
    balanceDueCents: invoiceBalance(record.total_cents, paidCents),
    status: deriveInvoiceStatus({
      lifecycle: record.lifecycle,
      totalCents: record.total_cents,
      paidCents,
      dueDate: record.due_date,
      today,
    }),
  };
}

async function executeInvoiceList(
  businessId: string,
  options: {
    customerId?: string;
    payableOnly?: boolean;
    search?: string;
    status?: InvoiceListFilter;
    today?: string;
    maximumRows?: number | null;
  },
) {
  const today = options.today ?? todayIso();
  const { paidCents, query } = invoiceListQuery(businessId, {
    ...options,
    today,
  });
  let invoiceQuery = query
    .selectAll("invoices")
    .select(paidCents.as("paid_cents"))
    .orderBy("invoices.created_at", "desc");
  if (options.maximumRows !== null) {
    invoiceQuery = invoiceQuery.limit(options.maximumRows ?? MAX_LIST_ROWS);
  }
  const invoices = await invoiceQuery.execute();

  return invoices.map((invoice) => toInvoiceListRow(invoice, today));
}

export function listInvoices(
  businessId: string,
  options: {
    search?: string;
    status?: InvoiceListFilter;
    today?: string;
  } = {},
): Promise<InvoiceListRow[]> {
  return executeInvoiceList(businessId, options);
}

export function listPayableInvoiceRows(
  businessId: string,
  today = todayIso(),
): Promise<InvoiceListRow[]> {
  return executeInvoiceList(businessId, { payableOnly: true, today });
}

export function listCustomerInvoices(
  businessId: string,
  customerId: string,
  today = todayIso(),
): Promise<InvoiceListRow[]> {
  return executeInvoiceList(businessId, {
    customerId,
    maximumRows: null,
    today,
  });
}

export async function listInvoicePage(
  businessId: string,
  options: {
    page: number;
    search?: string;
    status?: InvoiceListFilter;
    today?: string;
  },
): Promise<InvoiceListResult> {
  const page = Math.max(1, Math.min(10_000, Math.trunc(options.page)));
  const today = options.today ?? todayIso();
  const { paidCents, query } = invoiceListQuery(businessId, {
    ...options,
    today,
  });
  const [invoices, countRow] = await Promise.all([
    query
      .selectAll("invoices")
      .select(paidCents.as("paid_cents"))
      .orderBy("invoices.created_at", "desc")
      .limit(INVOICE_PAGE_SIZE)
      .offset((page - 1) * INVOICE_PAGE_SIZE)
      .execute(),
    query
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow(),
  ]);
  const total = Number(countRow.count);

  return {
    invoices: invoices.map((invoice) => toInvoiceListRow(invoice, today)),
    total,
    totalPages: Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE)),
  };
}

export async function getInvoiceOverview(
  businessId: string,
  currency: string,
  today = todayIso(),
): Promise<InvoiceOverview> {
  const paymentTotals = db
    .selectFrom("payments")
    .select("invoice_id")
    .select(({ fn }) => fn.sum<number>("amount_cents").as("paid_cents"))
    .where("business_id", "=", businessId)
    .groupBy("invoice_id")
    .as("payment_totals");
  const rows = await db
    .selectFrom("invoices")
    .leftJoin(paymentTotals, "payment_totals.invoice_id", "invoices.id")
    .select([
      "invoices.lifecycle",
      "invoices.total_cents",
      "invoices.due_date",
      "invoices.currency",
      "invoices.base_currency",
      "invoices.exchange_rate_micros",
    ])
    .select(
      sql<number>`coalesce(${sql.ref("payment_totals.paid_cents")}, 0)`.as(
        "paid_cents",
      ),
    )
    .where("invoices.business_id", "=", businessId)
    .execute();

  return summariseInvoiceOverview(rows, currency, today);
}

export type { InvoiceOverview } from "./overview";
