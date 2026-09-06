import { describe, expect, it } from "vitest";

import { customerSchema, parseCustomerListFilters } from "./schema";

const validCustomer = {
  name: "Northstar Studio",
  contact_name: "Ari Morgan",
  email: "ari@example.com",
  phone: "+44 20 7946 0018",
  tax_id: "GB123456789",
  address_line_1: "12 Example Road",
  address_line_2: "",
  city: "London",
  region: "",
  postal_code: "SW1A 1AA",
  country_code: "gb",
  notes: "Prefers email",
};

describe("customerSchema", () => {
  it("trims values, normalises country codes and nulls blank fields", () => {
    const result = customerSchema.parse({
      ...validCustomer,
      name: " Northstar Studio ",
      contact_name: " ",
    });

    expect(result).toMatchObject({
      name: "Northstar Studio",
      contact_name: null,
      country_code: "GB",
      address_line_2: null,
      region: null,
    });
  });

  it("rejects missing names and malformed optional emails", () => {
    expect(customerSchema.safeParse({ ...validCustomer, name: "" }).success).toBe(false);
    expect(
      customerSchema.safeParse({ ...validCustomer, email: "not-an-email" }).success,
    ).toBe(false);
  });
});
describe("parseCustomerListFilters", () => {
  it("uses bounded defaults for unsupported query values", () => {
    expect(
      parseCustomerListFilters({
        status: "deleted",
        page: "0",
        limit: "500",
      }),
    ).toEqual({ q: "", status: "active", page: 1, limit: 25 });
  });

  it("accepts supported search, archive and pagination filters", () => {
    expect(
      parseCustomerListFilters({
        q: "northstar",
        status: "archived",
        page: "2",
        limit: "50",
      }),
    ).toEqual({ q: "northstar", status: "archived", page: 2, limit: 50 });
  });
});
