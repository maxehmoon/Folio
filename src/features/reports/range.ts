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

export type ReportGranularity = "day" | "month" | "year";

export function reportChartBuckets(range: DateRange): {
  granularity: ReportGranularity;
  points: ChartPoint[];
} {
  const start = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  const days = (end.valueOf() - start.valueOf()) / 86_400_000 + 1;
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() - start.getUTCMonth() + 1;
  const granularity = days <= 31 ? "day" : months <= 24 ? "month" : "year";
  const cursor = new Date(start);
  if (granularity === "month") cursor.setUTCDate(1);
  if (granularity === "year") cursor.setUTCMonth(0, 1);

  const formatter = new Intl.DateTimeFormat("en-GB", {
    ...(granularity === "day" ? { day: "numeric" } : {}),
    month: "short",
    timeZone: "UTC",
  });
  const spansYears = start.getUTCFullYear() !== end.getUTCFullYear();
  const points: ChartPoint[] = [];

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const year = date.slice(0, 4);
    const key = date.slice(0, granularity === "day" ? 10 : granularity === "month" ? 7 : 4);
    const label = granularity === "year"
      ? year
      : `${formatter.format(cursor)}${granularity === "month" || spansYears ? ` ${year}` : ""}`;
    points.push({ key, label, salesCents: 0, receiptsCents: 0, expensesCents: 0 });

    if (granularity === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (granularity === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
  }

  return { granularity, points };
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
