import { describe, expect, it } from "vitest";

import type { Business } from "@/lib/db";

import { buildInvoiceSellerSnapshot } from "./seller-snapshot";

const business = {
  name: "Folio Studio",
  legal_name: "Folio Studio Ltd",
  email: "billing@folio.test",
  phone: "+44 20 7946 0000",
  tax_id: "GB123456789",
  address_line_1: "1 Market Street",
  address_line_2: null,
  city: "London",
  region: null,
  postal_code: "EC1 1AA",
  country_code: "GB",
  invoice_footer: "Registered in England and Wales.",
} as Business;

describe("buildInvoiceSellerSnapshot", () => {
  it("uses current legal and contact details for a draft invoice", () => {
    expect(buildInvoiceSellerSnapshot(business)).toEqual({
      seller_name: "Folio Studio Ltd",
      seller_email: "billing@folio.test",
      seller_phone: "+44 20 7946 0000",
      seller_tax_id: "GB123456789",
      seller_address: "1 Market Street\nLondon\nEC1 1AA\nGB",
      invoice_footer: "Registered in England and Wales.",
    });
  });

  it("falls back to the trading name and omits an empty address", () => {
    expect(
      buildInvoiceSellerSnapshot({
        ...business,
        legal_name: null,
        address_line_1: null,
        city: null,
        postal_code: null,
        country_code: null,
      }),
    ).toMatchObject({
      seller_name: "Folio Studio",
      seller_address: null,
    });
  });
});
