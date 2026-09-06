import "server-only";

import { COUNTRY_CODES } from "@/lib/countries";
import { INVOICE_CURRENCY_CODES } from "@/lib/currencies";

export type SetupDefaults = {
  countryCode?: string;
  currency?: string;
};

export function readSetupDefaults(
  environment: Record<string, string | undefined> = process.env,
): SetupDefaults {
  const currency = environment.DEFAULT_CURRENCY?.trim().toUpperCase();
  const countryCode = environment.DEFAULT_COUNTRY?.trim().toUpperCase();

  if (currency && !INVOICE_CURRENCY_CODES.has(currency)) {
    throw new Error(
      "DEFAULT_CURRENCY must be a supported three-letter currency code, such as GBP. Update or remove this environment variable and restart Folio.",
    );
  }
  if (countryCode && !COUNTRY_CODES.has(countryCode)) {
    throw new Error(
      "DEFAULT_COUNTRY must be a supported two-letter country code, such as GB. Update or remove this environment variable and restart Folio.",
    );
  }

  return {
    ...(currency ? { currency } : {}),
    ...(countryCode ? { countryCode } : {}),
  };
}
