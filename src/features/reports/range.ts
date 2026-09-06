export interface DateRange {
  from: string;
  to: string;
}

export interface ChartPoint {
  key: string;
  label: string;
  salesCents: number;
  receiptsCents: number;
  expensesCents: number;
}

export function lastSixMonths(now: Date | string = new Date()) {
  const points: ChartPoint[] = [];
  const anchor = typeof now === "string" ? new Date(`${now}T00:00:00.000Z`) : now;

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - offset, 1),
    );
    const key = date.toISOString().slice(0, 7);
    points.push({
      key,
      label: new Intl.DateTimeFormat("en-GB", {
        month: "short",
        timeZone: "UTC",
      }).format(date),
      salesCents: 0,
      receiptsCents: 0,
      expensesCents: 0,
    });
  }

  return points;
}

export function defaultReportRange(now: Date | string = new Date()): DateRange {
  const today = typeof now === "string" ? now : now.toISOString().slice(0, 10);
  if (!isIsoDate(today)) {
    throw new TypeError("Report date must use YYYY-MM-DD format.");
  }

  return {
    from: `${today.slice(0, 4)}-01-01`,
    to: today,
  };
}

export function parseDateRange(
  from: string | undefined,
  to: string | undefined,
  fallback = defaultReportRange(),
) {
  const parsedFrom = from && isIsoDate(from) ? from : fallback.from;
  const parsedTo = to && isIsoDate(to) ? to : fallback.to;

  return parsedFrom <= parsedTo
    ? { from: parsedFrom, to: parsedTo }
    : { from: parsedTo, to: parsedFrom };
}
import { isIsoDate } from "@/lib/iso-date";
