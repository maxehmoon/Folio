import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { Business } from "@/lib/db";

import { buildInvoiceSellerSnapshot } from "./seller-snapshot";

const business = {
  name: `Fictional Studio ${randomUUID()}`,
  legal_name: `Fictional Company ${randomUUID()}`,
  email: `${randomUUID()}@example.invalid`,
  phone: `synthetic-${randomInt(100000, 999999)}`,
  tax_id: `synthetic-${randomUUID()}`,
  address_line_1: `${randomInt(1, 999)} Fictional-${randomUUID()} Way`,
  address_line_2: null,
  city: `Imaginary-${randomUUID()}`,
  region: null,
  postal_code: `SYN-${randomInt(1000, 9999)}`,
  country_code: "CA",
  invoice_footer: `Fictional footer ${randomUUID()}`,
} as Business;

describe("buildInvoiceSellerSnapshot", () => {
  it("uses current legal and contact details for a draft invoice", () => {
    expect(buildInvoiceSellerSnapshot(business)).toEqual({
      seller_name: business.legal_name,
      seller_email: business.email,
      seller_phone: business.phone,
      seller_tax_id: business.tax_id,
      seller_address: `${business.address_line_1}\n${business.city}\n${business.postal_code}`,
      seller_country_code: "CA",
      invoice_footer: business.invoice_footer,
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
      seller_name: business.name,
      seller_address: null,
      seller_country_code: null,
    });
  });
});
