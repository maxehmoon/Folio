import "server-only";

import { EXCHANGE_RATE_SCALE } from "@/lib/finance/exchange";

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const FRANKFURTER_ORIGIN = "https://api.frankfurter.dev";
const PREFERRED_PROVIDER = "ECB";
export const MAX_EXCHANGE_RATE_RESPONSE_BYTES = 16 * 1024;

type FrankfurterRate = {
  date?: string;
  rate?: number;
};

export type ExchangeRate = {
  base: string;
  quote: string;
  rateMicros: number;
  date: string;
  source: string;
};

function currencyCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(code)) throw new Error("Invalid currency code");
  return code;
}

async function requestRate(url: URL) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Exchange-rate provider returned ${response.status}`);

  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    contentType !== "application/json" &&
    !contentType?.endsWith("+json")
  ) {
    throw new Error("Exchange-rate provider returned a non-JSON response");
  }

  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^(0|[1-9]\d*)$/.test(declaredLength) ||
      Number(declaredLength) > MAX_EXCHANGE_RATE_RESPONSE_BYTES)
  ) {
    throw new Error("Exchange-rate provider response is too large");
  }
  if (!response.body) throw new Error("Exchange-rate provider returned no body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_EXCHANGE_RATE_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new Error("Exchange-rate provider response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body)) as FrankfurterRate;
}

export async function getExchangeRate(
  baseValue: string,
  quoteValue: string,
  date?: string | null,
): Promise<ExchangeRate> {
  const base = currencyCode(baseValue);
  const quote = currencyCode(quoteValue);
  const requestedDate = date?.trim() || undefined;

  if (base === quote) {
    return {
      base,
      quote,
      rateMicros: EXCHANGE_RATE_SCALE,
      date: requestedDate ?? new Date().toISOString().slice(0, 10),
      source: "Identity",
    };
  }

  const url = new URL(
    `/v2/rate/${encodeURIComponent(base)}/${encodeURIComponent(quote)}`,
    FRANKFURTER_ORIGIN,
  );
  if (requestedDate) url.searchParams.set("date", requestedDate);

  url.searchParams.set("providers", PREFERRED_PROVIDER);
  let result: FrankfurterRate;
  let source = PREFERRED_PROVIDER;

  try {
    result = await requestRate(url);
  } catch {
    // The ECB does not publish every supported currency. Frankfurter's
    // aggregate is the keyless fallback for those pairs.
    url.searchParams.delete("providers");
    result = await requestRate(url);
    source = "Frankfurter";
  }

  const rate = Number(result.rate);
  if (!Number.isFinite(rate) || rate <= 0 || !result.date) {
    throw new Error("Exchange-rate provider returned an invalid rate");
  }

  const rateMicros = Math.round(rate * EXCHANGE_RATE_SCALE);
  if (!Number.isSafeInteger(rateMicros) || rateMicros <= 0) {
    throw new Error("Exchange-rate provider returned an unsupported rate");
  }

  return {
    base,
    quote,
    rateMicros,
    date: result.date,
    source,
  };
}
