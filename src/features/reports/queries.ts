import "server-only";

import {
  loadFinancialEntries,
  summariseFinancialEntries,
  type FinancialTotals,
} from "@/features/finance/ledger";

export {
  defaultReportRange,
  lastSixMonths,
  parseDateRange,
  type ChartPoint,
  type DateRange,
} from "./range";

import type { DateRange } from "./range";

export type FinancialSummary = FinancialTotals;

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
