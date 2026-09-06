import { describe, expect, it } from "vitest";

import {
  businessProfileFormValues,
  settingsBusinessProfileSchema,
  setupBusinessProfileSchema,
  toBusinessProfileUpdate,
} from "@/features/business/profile";

function profileFormData() {
  const formData = new FormData();
  const values = {
    name: "  Acme Studio  ",
    legalName: "",
    email: "  HELLO@EXAMPLE.COM ",
    phone: "",
    taxId: "",
    addressLine1: "1 Market Street",
    addressLine2: "",
    city: "London",
    region: "",
    postalCode: "SW1A 1AA",
    countryCode: "gb",
    currency: "gbp",
    timezone: "Europe/London",
    invoicePrefix: "inv",
    paymentTermsDays: "30",
    paymentInstructions: "",
    invoiceFooter: "",
  };
  for (const [name, value] of Object.entries(values)) formData.set(name, value);
  return formData;
}

describe("business profile forms", () => {
  it("normalises a setup profile and maps it to the database contract", () => {
    const result = setupBusinessProfileSchema.safeParse(
      businessProfileFormValues(profileFormData()),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(toBusinessProfileUpdate(result.data)).toMatchObject({
      name: "Acme Studio",
      legal_name: null,
      email: "hello@example.com",
      country_code: "GB",
      currency: "GBP",
      invoice_prefix: "INV",
      default_payment_terms_days: 30,
    });
  });

  it("requires the seller address during setup but permits clearing it later", () => {
    const formData = profileFormData();
    formData.set("addressLine1", "");
    formData.set("city", "");
    formData.set("postalCode", "");
    const values = businessProfileFormValues(formData);

    expect(setupBusinessProfileSchema.safeParse(values).success).toBe(false);

    const settings = settingsBusinessProfileSchema.safeParse(values);
    expect(settings.success).toBe(true);
    if (!settings.success) return;
    expect(settings.data).toMatchObject({
      addressLine1: null,
      city: null,
      postalCode: null,
    });
  });
});
