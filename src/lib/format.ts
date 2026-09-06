const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  amountCents: number,
  currency = "GBP",
  locale = "en-GB",
) {
  const key = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    });
    currencyFormatters.set(key, formatter);
  }

  return formatter.format(amountCents / 100);
}

export function formatDate(value: string | Date, locale = "en-GB") {
  const date =
    value instanceof Date
      ? value
      : new Date(value.includes("T") ? value : `${value}T00:00:00Z`);

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function parseMoneyToCents(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    return null;
  }

  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function todayInTimeZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
