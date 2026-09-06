import "server-only";

import { sql } from "kysely";

import { db, getDatabaseDialect } from "@/lib/db";
import { likeContainsPattern } from "@/lib/db/like";
import type { Expense } from "@/lib/db/types";
import { requireBusiness } from "@/lib/session";
import { todayInTimeZone } from "@/lib/format";
import type { ExpenseListFilters } from "@/features/expenses/schema";

export type ExpenseListResult = {
  expenses: Expense[];
  categories: string[];
  summary: {
    categoryBreakdown: { category: string; totalCents: number }[];
    currency: string;
    monthCents: number;
    receiptCount: number;
    taxCents: number;
    yearCents: number;
    yearCount: number;
  };
  total: number;
  totalPages: number;
};

export async function listExpenses(
  filters: ExpenseListFilters,
): Promise<ExpenseListResult> {
  const business = await requireBusiness();
  const offset = (filters.page - 1) * filters.limit;
  const search = likeContainsPattern(filters.q);
  const today = todayInTimeZone(business.timezone);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const monthStart = `${today.slice(0, 7)}-01`;

  let listQuery = db
    .selectFrom("expenses")
    .selectAll()
    .where("business_id", "=", business.id);

  if (filters.q) {
    listQuery = listQuery.where(
      getDatabaseDialect() === "postgres"
        ? sql<boolean>`(
            ${sql.ref("expenses.vendor")} ilike ${search} escape '!'
            or ${sql.ref("expenses.category")} ilike ${search} escape '!'
            or coalesce(${sql.ref("expenses.description")}, '') ilike ${search} escape '!'
            or coalesce(${sql.ref("expenses.reference")}, '') ilike ${search} escape '!'
          )`
        : sql<boolean>`(
            ${sql.ref("expenses.vendor")} like ${search} escape '!'
            or ${sql.ref("expenses.category")} like ${search} escape '!'
            or coalesce(${sql.ref("expenses.description")}, '') like ${search} escape '!'
            or coalesce(${sql.ref("expenses.reference")}, '') like ${search} escape '!'
          )`,
    );
  }

  if (filters.category) {
    listQuery = listQuery.where("category", "=", filters.category);
  }

  const [rows, categoryRows, countRow, summaryRow, categoryBreakdown] = await Promise.all([
    listQuery
      .orderBy("expense_date", "desc")
      .orderBy("created_at", "desc")
      .limit(filters.limit)
      .offset(offset)
      .execute(),
    db
      .selectFrom("expenses")
      .select("category")
      .distinct()
      .where("business_id", "=", business.id)
      .orderBy("category", "asc")
      .execute(),
    listQuery
      .select((expression) => expression.fn.countAll().as("count"))
      .executeTakeFirst(),
    db
      .selectFrom("expenses")
      .select([
        sql<number>`coalesce(sum(${sql.ref("total_cents")}), 0)`.as("year_cents"),
        sql<number>`coalesce(sum(${sql.ref("tax_cents")}), 0)`.as("tax_cents"),
        sql<number>`coalesce(sum(case when ${sql.ref("expense_date")} >= ${monthStart} then ${sql.ref("total_cents")} else 0 end), 0)`.as("month_cents"),
        sql<number>`sum(case when ${sql.ref("receipt_url")} is not null or ${sql.ref("receipt_data_url")} is not null then 1 else 0 end)`.as("receipt_count"),
        sql<number>`count(*)`.as("year_count"),
      ])
      .where("business_id", "=", business.id)
      .where("currency", "=", business.currency)
      .where("expense_date", ">=", yearStart)
      .executeTakeFirst(),
    db
      .selectFrom("expenses")
      .select("category")
      .select(({ fn }) => fn.sum<number>("total_cents").as("total_cents"))
      .where("business_id", "=", business.id)
      .where("currency", "=", business.currency)
      .where("expense_date", ">=", yearStart)
      .groupBy("category")
      .orderBy("total_cents", "desc")
      .limit(5)
      .execute(),
  ]);

  const total = Number(countRow?.count ?? 0);

  return {
    expenses: rows,
    categories: categoryRows.map(({ category }) => category),
    summary: {
      categoryBreakdown: categoryBreakdown.map((row) => ({
        category: row.category,
        totalCents: Number(row.total_cents),
      })),
      currency: business.currency,
      monthCents: Number(summaryRow?.month_cents ?? 0),
      receiptCount: Number(summaryRow?.receipt_count ?? 0),
      taxCents: Number(summaryRow?.tax_cents ?? 0),
      yearCents: Number(summaryRow?.year_cents ?? 0),
      yearCount: Number(summaryRow?.year_count ?? 0),
    },
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
  };
}

export async function getExpense(expenseId: string): Promise<Expense | undefined> {
  const business = await requireBusiness();
  return db
    .selectFrom("expenses")
    .selectAll()
    .where("id", "=", expenseId)
    .where("business_id", "=", business.id)
    .executeTakeFirst();
}
