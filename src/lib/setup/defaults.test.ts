import { describe, expect, it } from "vitest";

import { COUNTRIES } from "@/lib/countries";
import { INVOICE_CURRENCIES } from "@/lib/currencies";
import { readSetupDefaults } from "@/lib/setup/defaults";

describe("readSetupDefaults", () => {
  it("leaves missing or empty defaults to the setup form", () => {
    expect(readSetupDefaults({})).toEqual({});
    expect(
      readSetupDefaults({ DEFAULT_COUNTRY: " ", DEFAULT_CURRENCY: "" }),
    ).toEqual({});
  });

  it("normalises configured defaults independently", () => {
    expect(readSetupDefaults({ DEFAULT_CURRENCY: " gbp " })).toEqual({
      currency: "GBP",
    });
    expect(readSetupDefaults({ DEFAULT_COUNTRY: " de " })).toEqual({
      countryCode: "DE",
    });
    expect(
      readSetupDefaults({ DEFAULT_COUNTRY: "gb", DEFAULT_CURRENCY: "eur" }),
    ).toEqual({ countryCode: "GB", currency: "EUR" });
  });

  it("accepts every currency and country offered by the setup controls", () => {
    for (const { code } of INVOICE_CURRENCIES) {
      expect(readSetupDefaults({ DEFAULT_CURRENCY: code })).toEqual({
        currency: code,
      });
    }
    for (const { code } of COUNTRIES) {
      expect(readSetupDefaults({ DEFAULT_COUNTRY: code })).toEqual({
        countryCode: code,
      });
    }
  });

  it.each(["BTC", "Pound sterling", "GB", "123"])(
    "rejects unsupported currency %s with an actionable configuration error",
    (currency) => {
      expect(() => readSetupDefaults({ DEFAULT_CURRENCY: currency })).toThrow(
        "DEFAULT_CURRENCY must be a supported three-letter currency code, such as GBP. Update or remove this environment variable and restart Folio.",
      );
    },
  );

  it.each(["UK", "United Kingdom", "GBR", "12"])(
    "rejects unsupported country %s with an actionable configuration error",
    (country) => {
      expect(() => readSetupDefaults({ DEFAULT_COUNTRY: country })).toThrow(
        "DEFAULT_COUNTRY must be a supported two-letter country code, such as GB. Update or remove this environment variable and restart Folio.",
      );
    },
  );

  it("does not mutate the environment or derive unrelated defaults", () => {
    const environment = Object.freeze({ DEFAULT_COUNTRY: "gb" });
    expect(readSetupDefaults(environment)).toEqual({ countryCode: "GB" });
    expect(environment).toEqual({ DEFAULT_COUNTRY: "gb" });
  });
});
