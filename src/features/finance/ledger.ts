import "server-only";

import { sql, type Kysely } from "kysely";

import { db, type Database } from "@/lib/db";
import {
  convertToBaseCurrency,
  type BaseCurrencyConversion,
} from "@/lib/finance/exchange";

export type FinancialEntryKind = "expense" | "receipt" | "sale";

export type FinancialEntry = {
  id: string;
  kind: FinancialEntryKind;
  date: string;
  reference: string;
  party: string;
  description: string;
  amountCents: number;
  currency: string;
  baseConversion: BaseCurrencyConversion;
  rateDate: string | null;
  rateSource: string | null;
};

export type FinancialTotals = {
  salesCents: number;
  receiptsCents: number;
  expensesCents: number;
  netIncomeCents: number;
  missingConversionCount: number;
};

export type FinancialEntryRange = {
  from: string;
  to?: string;
};

type FinancialEntryQuery = {
  businessId: string;
  baseCurrency: string;
  range: FinancialEntryRange;
};

function requireStoredAmount(value: number, field: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${field} must be a safe integer`);
  }
  return value;
}

function addAmounts(left: number, right: number, field: string): number {
  const total = Number(BigInt(left) + BigInt(right));
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`${field} is too large`);
  }
  return total;
}

export function summariseFinancialEntries(
  entries: readonly FinancialEntry[],
): FinancialTotals {
  let salesCents = 0;
  let receiptsCents = 0;
  let expensesCents = 0;
  let missingConversionCount = 0;

  for (const entry of entries) {
    if (entry.baseConversion.status === "missing-rate") {
      missingConversionCount += 1;
      continue;
    }

    const amount = entry.baseConversion.amountCents;
    if (entry.kind === "sale") {
      salesCents = addAmounts(salesCents, amount, "sales total");
    } else if (entry.kind === "receipt") {
      receiptsCents = addAmounts(receiptsCents, amount, "receipts total");
    } else {
      expensesCents = addAmounts(expensesCents, amount, "expenses total");
    }
  }

  const netIncomeCents = addAmounts(
    receiptsCents,
    -expensesCents,
    "net income",
  );

  return {
    salesCents,
    receiptsCents,
    expensesCents,
    netIncomeCents,
    missingConversionCount,
  };
}

export async function loadFinancialEntriesWithDatabase(
  database: Kysely<Database>,
  { businessId, baseCurrency, range }: FinancialEntryQuery,
): Promise<FinancialEntry[]> {
  let invoicesQuery = database
    .selectFrom("invoices")
    .select([
      "id",
      "issue_date",
      "invoice_number",
      "customer_name",
      "notes",
      "total_cents",
      "currency",
      "base_currency",
      "exchange_rate_micros",
      "exchange_rate_date",
      "exchange_rate_source",
    ])
    .where("business_id", "=", businessId)
    .where("lifecycle", "=", "issued")
    .where("issue_date", ">=", range.from);
  let paymentsQuery = database
    .selectFrom("payments")
    .innerJoin("invoices", (join) =>
      join
        .onRef("invoices.id", "=", "payments.invoice_id")
        .onRef("invoices.business_id", "=", "payments.business_id"),
    )
    .select([
      "payments.id",
      "payments.payment_date",
      "payments.reference",
      "payments.amount_cents",
      "payments.currency",
      "invoices.invoice_number",
      "invoices.customer_name",
      sql<string | null>`case when payments.base_currency is null and payments.currency = invoices.currency then invoices.base_currency else payments.base_currency end`.as("base_currency"),
      sql<number | null>`case when payments.base_currency is null and payments.currency = invoices.currency then invoices.exchange_rate_micros else payments.exchange_rate_micros end`.as("exchange_rate_micros"),
      sql<string | null>`case when payments.base_currency is null and payments.currency = invoices.currency then invoices.exchange_rate_date else payments.exchange_rate_date end`.as("exchange_rate_date"),
      sql<string | null>`case when payments.base_currency is null and payments.currency = invoices.currency then invoices.exchange_rate_source else payments.exchange_rate_source end`.as("exchange_rate_source"),
    ])
    .where("payments.business_id", "=", businessId)
    .where("payments.payment_date", ">=", range.from);
  let expensesQuery = database
    .selectFrom("expenses")
    .select([
      "id",
      "expense_date",
      "reference",
      "vendor",
      "description",
      "total_cents",
      "currency",
    ])
    .where("business_id", "=", businessId)
    .where("expense_date", ">=", range.from);

  if (range.to) {
    invoicesQuery = invoicesQuery.where("issue_date", "<=", range.to);
    paymentsQuery = paymentsQuery.where("payments.payment_date", "<=", range.to);
    expensesQuery = expensesQuery.where("expense_date", "<=", range.to);
  }

  const [invoices, payments, expenses] = await Promise.all([
    invoicesQuery.execute(),
    paymentsQuery.execute(),
    expensesQuery.execute(),
  ]);

  return [
    ...invoices.map((invoice): FinancialEntry => {
      if (!invoice.issue_date) {
        throw new Error(`Issued invoice ${invoice.id} has no issue date`);
      }
      const amountCents = requireStoredAmount(
        invoice.total_cents,
        "invoice total",
      );
      return {
        id: invoice.id,
        kind: "sale",
        date: invoice.issue_date,
        reference: invoice.invoice_number ?? "",
        party: invoice.customer_name,
        description: invoice.notes ?? "Invoice issued",
        amountCents,
        currency: invoice.currency,
        baseConversion: convertToBaseCurrency({
          amountCents,
          currency: invoice.currency,
          baseCurrency,
          storedBaseCurrency: invoice.base_currency,
          rateMicros: invoice.exchange_rate_micros,
        }),
        rateDate: invoice.exchange_rate_date,
        rateSource: invoice.exchange_rate_source,
      };
    }),
    ...payments.map((payment): FinancialEntry => {
      const amountCents = requireStoredAmount(
        payment.amount_cents,
        "payment amount",
      );
      return {
        id: payment.id,
        kind: "receipt",
        date: payment.payment_date,
        reference: payment.reference ?? payment.invoice_number ?? "",
        party: payment.customer_name,
        description: payment.invoice_number
          ? `Payment for ${payment.invoice_number}`
          : "Payment received",
        amountCents,
        currency: payment.currency,
        baseConversion: convertToBaseCurrency({
          amountCents,
          currency: payment.currency,
          baseCurrency,
          storedBaseCurrency: payment.base_currency,
          rateMicros: payment.exchange_rate_micros,
        }),
        rateDate: payment.exchange_rate_date,
        rateSource: payment.exchange_rate_source,
      };
    }),
    ...expenses.map((expense): FinancialEntry => {
      const amountCents = requireStoredAmount(
        expense.total_cents,
        "expense total",
      );
      return {
        id: expense.id,
        kind: "expense",
        date: expense.expense_date,
        reference: expense.reference ?? "",
        party: expense.vendor,
        description: expense.description ?? "Expense",
        amountCents,
        currency: expense.currency,
        baseConversion: convertToBaseCurrency({
          amountCents,
          currency: expense.currency,
          baseCurrency,
          storedBaseCurrency: null,
          rateMicros: null,
        }),
        rateDate: null,
        rateSource: null,
      };
    }),
  ];
}

export function loadFinancialEntries(
  query: FinancialEntryQuery,
): Promise<FinancialEntry[]> {
  return loadFinancialEntriesWithDatabase(db, query);
}
