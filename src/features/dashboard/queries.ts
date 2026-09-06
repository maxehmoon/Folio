import "server-only";

import { sql } from "kysely";

import {
  loadFinancialEntries,
  summariseFinancialEntries,
  type FinancialEntryRange,
  type FinancialTotals,
} from "@/features/finance/ledger";
import { deriveInvoiceStatus } from "@/features/invoices/calculations";
import { lastSixMonths, type ChartPoint } from "@/features/reports/range";
import { db } from "@/lib/db";
import type { InvoiceStatus } from "@/lib/db/types";
import { convertToBaseCurrency } from "@/lib/finance/exchange";

export type DashboardSummary = FinancialTotals & {
  amountDueCents: number;
  dueInvoices: number;
  missingAmountDueCount: number;
  overdueInvoices: number;
  totalCustomers: number;
  totalInvoices: number;
};

export type DashboardActivity = {
  detail: string;
  happenedAt: string;
  href: string;
  id: string;
  kind: "customer" | "expense" | "invoice" | "payment";
  money: { amountCents: number; currency: string } | null;
  title: string;
};

export type DashboardRecentInvoice = {
  createdAt: string;
  currency: string;
  customerId: string | null;
  customerName: string;
  id: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  status: InvoiceStatus;
  totalCents: number;
};

export type DashboardUpdates = {
  activity: DashboardActivity[];
  invoices: DashboardRecentInvoice[];
};

export type FinancialSeries = {
  missingConversionCount: number;
  points: ChartPoint[];
};

function checkedInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${field} must be a safe integer`);
  }
  return value;
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

export async function getDashboardSummary(
  businessId: string,
  range: FinancialEntryRange,
  baseCurrency: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<DashboardSummary> {
  const [entries, invoices, payments, customers, invoiceCount] =
    await Promise.all([
      loadFinancialEntries({ businessId, baseCurrency, range }),
      db
        .selectFrom("invoices")
        .select([
          "id",
          "total_cents",
          "due_date",
          "currency",
          "base_currency",
          "exchange_rate_micros",
        ])
        .where("business_id", "=", businessId)
        .where("lifecycle", "=", "issued")
        .execute(),
      db
        .selectFrom("payments")
        .select(["invoice_id", "amount_cents"])
        .where("business_id", "=", businessId)
        .execute(),
      db
        .selectFrom("customers")
        .select("id")
        .where("business_id", "=", businessId)
        .where("archived_at", "is", null)
        .execute(),
      db
        .selectFrom("invoices")
        .select("id")
        .where("business_id", "=", businessId)
        .execute(),
    ]);

  const paidByInvoice = new Map<string, number>();
  for (const payment of payments) {
    const next =
      (paidByInvoice.get(payment.invoice_id) ?? 0) +
      checkedInteger(payment.amount_cents, "payment amount");
    paidByInvoice.set(
      payment.invoice_id,
      checkedInteger(next, "invoice payment total"),
    );
  }

  let amountDueCents = 0;
  let dueInvoices = 0;
  let overdueInvoices = 0;
  let missingAmountDueCount = 0;

  for (const invoice of invoices) {
    const balance = Math.max(
      0,
      checkedInteger(invoice.total_cents, "invoice total") -
        (paidByInvoice.get(invoice.id) ?? 0),
    );
    if (balance === 0) continue;

    const conversion = convertToBaseCurrency({
      amountCents: balance,
      currency: invoice.currency,
      baseCurrency,
      storedBaseCurrency: invoice.base_currency,
      rateMicros: invoice.exchange_rate_micros,
    });
    if (conversion.status === "converted") {
      amountDueCents = checkedInteger(
        amountDueCents + conversion.amountCents,
        "amount due",
      );
    } else {
      missingAmountDueCount += 1;
    }
    dueInvoices += 1;
    if (invoice.due_date && invoice.due_date < today) overdueInvoices += 1;
  }

  return {
    ...summariseFinancialEntries(entries),
    amountDueCents,
    dueInvoices,
    missingAmountDueCount,
    overdueInvoices,
    totalCustomers: customers.length,
    totalInvoices: invoiceCount.length,
  };
}

export async function getDashboardUpdates(
  businessId: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<DashboardUpdates> {
  const paymentTotals = db
    .selectFrom("payments")
    .select("invoice_id")
    .select(({ fn }) => fn.sum<number>("amount_cents").as("paid_cents"))
    .where("business_id", "=", businessId)
    .groupBy("invoice_id")
    .as("payment_totals");
  const paidCents = sql<number>`coalesce(${sql.ref("payment_totals.paid_cents")}, 0)`;

  const [invoiceRows, paymentRows, customerRows, expenseRows] = await Promise.all([
    db
      .selectFrom("invoices")
      .leftJoin(paymentTotals, "payment_totals.invoice_id", "invoices.id")
      .select([
        "invoices.id",
        "invoices.invoice_number",
        "invoices.lifecycle",
        "invoices.customer_id",
        "invoices.customer_name",
        "invoices.issue_date",
        "invoices.due_date",
        "invoices.total_cents",
        "invoices.currency",
        "invoices.created_at",
      ])
      .select(paidCents.as("paid_cents"))
      .where("invoices.business_id", "=", businessId)
      .orderBy("invoices.created_at", "desc")
      .limit(5)
      .execute(),
    db
      .selectFrom("payments")
      .innerJoin("invoices", (join) =>
        join
          .onRef("invoices.id", "=", "payments.invoice_id")
          .onRef("invoices.business_id", "=", "payments.business_id"),
      )
      .select([
        "payments.id",
        "payments.invoice_id",
        "payments.amount_cents",
        "payments.currency",
        "payments.created_at",
        "invoices.invoice_number",
        "invoices.customer_name",
      ])
      .where("payments.business_id", "=", businessId)
      .orderBy("payments.created_at", "desc")
      .limit(5)
      .execute(),
    db
      .selectFrom("customers")
      .select(["id", "name", "created_at"])
      .where("business_id", "=", businessId)
      .orderBy("created_at", "desc")
      .limit(5)
      .execute(),
    db
      .selectFrom("expenses")
      .select(["id", "vendor", "total_cents", "currency", "created_at"])
      .where("business_id", "=", businessId)
      .orderBy("created_at", "desc")
      .limit(5)
      .execute(),
  ]);

  const invoices = invoiceRows.map((invoice) => {
    const paid = checkedInteger(Number(invoice.paid_cents), "invoice payment total");
    return {
      createdAt: invoice.created_at,
      currency: invoice.currency,
      customerId: invoice.customer_id,
      customerName: invoice.customer_name,
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      status: deriveInvoiceStatus({
        lifecycle: invoice.lifecycle,
        totalCents: invoice.total_cents,
        paidCents: paid,
        dueDate: invoice.due_date,
        today,
      }),
      totalCents: invoice.total_cents,
    };
  });

  const activity: DashboardActivity[] = [
    ...invoiceRows.map((invoice) => ({
      detail: invoice.customer_name,
      happenedAt: invoice.created_at,
      href: `/invoices/${invoice.id}`,
      id: `invoice:${invoice.id}`,
      kind: "invoice" as const,
      money: {
        amountCents: invoice.total_cents,
        currency: invoice.currency,
      },
      title: invoice.invoice_number ?? "Draft invoice created",
    })),
    ...paymentRows.map((payment) => ({
      detail: [payment.invoice_number, payment.customer_name]
        .filter(Boolean)
        .join(" · "),
      happenedAt: payment.created_at,
      href: `/invoices/${payment.invoice_id}#payments`,
      id: `payment:${payment.id}`,
      kind: "payment" as const,
      money: {
        amountCents: payment.amount_cents,
        currency: payment.currency,
      },
      title: "Payment received",
    })),
    ...customerRows.map((customer) => ({
      detail: customer.name,
      happenedAt: customer.created_at,
      href: `/customers/${customer.id}`,
      id: `customer:${customer.id}`,
      kind: "customer" as const,
      money: null,
      title: "Customer added",
    })),
    ...expenseRows.map((expense) => ({
      detail: expense.vendor,
      happenedAt: expense.created_at,
      href: `/expenses/${expense.id}`,
      id: `expense:${expense.id}`,
      kind: "expense" as const,
      money: {
        amountCents: expense.total_cents,
        currency: expense.currency,
      },
      title: "Expense recorded",
    })),
  ];

  activity.sort((left, right) => right.happenedAt.localeCompare(left.happenedAt));
  return { activity: activity.slice(0, 5), invoices };
}

export async function getFinancialSeries(
  businessId: string,
  baseCurrency: string,
  now: Date | string = new Date(),
): Promise<FinancialSeries> {
  const points = lastSixMonths(now);
  const entries = await loadFinancialEntries({
    businessId,
    baseCurrency,
    range: { from: `${points[0].key}-01` },
  });
  const byMonth = new Map(points.map((point) => [point.key, point]));
  let missingConversionCount = 0;

  for (const entry of entries) {
    const point = byMonth.get(monthKey(entry.date));
    if (!point) continue;
    if (entry.baseConversion.status === "missing-rate") {
      missingConversionCount += 1;
      continue;
    }
    const amount = entry.baseConversion.amountCents;
    if (entry.kind === "sale") {
      point.salesCents = checkedInteger(
        point.salesCents + amount,
        "chart sales total",
      );
    } else if (entry.kind === "receipt") {
      point.receiptsCents = checkedInteger(
        point.receiptsCents + amount,
        "chart receipts total",
      );
    } else {
      point.expensesCents = checkedInteger(
        point.expensesCents + amount,
        "chart expenses total",
      );
    }
  }

  return { missingConversionCount, points };
}
