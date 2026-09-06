export const EXCHANGE_RATE_SCALE = 1_000_000;

export type BaseCurrencyConversion =
  | { status: "converted"; amountCents: number }
  | {
      status: "missing-rate";
      reason: "base-currency-mismatch" | "missing-rate";
    };

export function convertCents(amountCents: number, rateMicros: number): number {
  if (
    !Number.isSafeInteger(amountCents) ||
    !Number.isSafeInteger(rateMicros) ||
    rateMicros <= 0
  ) {
    throw new RangeError("The currency amount is too large");
  }
  const amount = BigInt(amountCents);
  const sign = amount < 0n ? -1n : 1n;
  const absoluteAmount = amount < 0n ? -amount : amount;
  const converted = Number(
    sign *
      ((absoluteAmount * BigInt(rateMicros) +
        BigInt(EXCHANGE_RATE_SCALE / 2)) /
        BigInt(EXCHANGE_RATE_SCALE)),
  );
  if (!Number.isSafeInteger(converted)) {
    throw new RangeError("The converted currency amount is too large");
  }
  return converted;
}

export function convertToBaseCurrency({
  amountCents,
  currency,
  baseCurrency,
  storedBaseCurrency,
  rateMicros,
}: {
  amountCents: number;
  currency: string;
  baseCurrency: string;
  storedBaseCurrency: string | null;
  rateMicros: number | null;
}): BaseCurrencyConversion {
  if (!Number.isSafeInteger(amountCents)) {
    throw new RangeError("The currency amount is too large");
  }
  if (currency === baseCurrency) {
    return { status: "converted", amountCents };
  }
  if (storedBaseCurrency !== baseCurrency) {
    return { status: "missing-rate", reason: "base-currency-mismatch" };
  }
  if (rateMicros === null) {
    return { status: "missing-rate", reason: "missing-rate" };
  }
  return {
    status: "converted",
    amountCents: convertCents(amountCents, rateMicros),
  };
}
