import type { FinancialEntry } from "@/features/finance/ledger";

import { reportChartBuckets, type DateRange } from "./range";

export type ExpenseCategoryTotal = { category: string; totalCents: number };

function addAmounts(left: number, right: number): number {
  const total = Number(BigInt(left) + BigInt(right));
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("Report total is too large");
  }
  return total;
}

export function buildReportInsights(
  entries: readonly FinancialEntry[],
  range: DateRange,
  categoriesByExpense: ReadonlyMap<string, string>,
) {
  const { granularity, points } = reportChartBuckets(range);
  const keyLength = granularity === "day" ? 10 : granularity === "month" ? 7 : 4;
  const byPeriod = new Map(points.map((point) => [point.key, point]));
  const categoryTotals = new Map<string, number>();
  let invoiceCount = 0;
  let receiptCount = 0;
  let expenseCount = 0;

  for (const entry of entries) {
    if (
      entry.date < range.from ||
      entry.date > range.to ||
      entry.baseConversion.status === "missing-rate"
    ) continue;

    const point = byPeriod.get(entry.date.slice(0, keyLength));
    if (!point) continue;
    const amount = entry.baseConversion.amountCents;

    if (entry.kind === "sale") {
      point.salesCents = addAmounts(point.salesCents, amount);
      invoiceCount += 1;
    } else if (entry.kind === "receipt") {
      point.receiptsCents = addAmounts(point.receiptsCents, amount);
      receiptCount += 1;
    } else {
      point.expensesCents = addAmounts(point.expensesCents, amount);
      expenseCount += 1;
      const category = categoriesByExpense.get(entry.id)?.trim() || "Uncategorised";
      categoryTotals.set(category, addAmounts(categoryTotals.get(category) ?? 0, amount));
    }
  }

  const expenseCategories: ExpenseCategoryTotal[] = [...categoryTotals]
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((left, right) => right.totalCents - left.totalCents || left.category.localeCompare(right.category));

  return { granularity, points, expenseCategories, invoiceCount, receiptCount, expenseCount };
}
