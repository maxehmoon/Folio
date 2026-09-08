import "server-only";

import {
  loadFinancialEntries,
  summariseFinancialEntries,
  type FinancialTotals,
} from "@/features/finance/ledger";
import { db } from "@/lib/db";

import { buildReportInsights } from "./insights";

export {
  defaultReportRange,
  lastSixMonths,
  parseDateRange,
  type ChartPoint,
  type DateRange,
  type ReportGranularity,
} from "./range";
export type { ExpenseCategoryTotal } from "./insights";

import type { DateRange } from "./range";

export type FinancialSummary = FinancialTotals;
export type ReportInsights = ReturnType<typeof buildReportInsights> & {
  summary: FinancialSummary;
};

export async function getReportInsights(
  businessId: string,
  range: DateRange,
  baseCurrency: string,
): Promise<ReportInsights> {
  const [entries, categories] = await Promise.all([
    loadFinancialEntries({ businessId, baseCurrency, range }),
    db
      .selectFrom("expenses")
      .select(["id", "category"])
      .where("business_id", "=", businessId)
      .where("expense_date", ">=", range.from)
      .where("expense_date", "<=", range.to)
      .execute(),
  ]);

  return {
    summary: summariseFinancialEntries(entries),
    ...buildReportInsights(entries, range, new Map(categories.map(({ id, category }) => [id, category]))),
  };
}

export async function getFinancialSummary(
  businessId: string,
  range: DateRange,
  baseCurrency: string,
): Promise<FinancialSummary> {
  const entries = await loadFinancialEntries({
    businessId,
    baseCurrency,
    range,
  });
  return summariseFinancialEntries(entries);
}
