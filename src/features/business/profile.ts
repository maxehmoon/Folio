import { z } from "zod";

import { COUNTRY_CODES } from "@/lib/countries";
import { INVOICE_CURRENCY_CODES } from "@/lib/currencies";
import type { BusinessProfileUpdate } from "@/lib/db/businesses";
import { SUPPORTED_TIMEZONE_IDS } from "@/lib/timezones";

const requiredText = (maximum: number) =>
  z.string().trim().min(1).max(maximum);

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null);

const countryCode = z
  .string()
  .trim()
  .regex(/^[a-z]{2}$/i)
  .transform((value) => value.toUpperCase())
  .refine((value) => COUNTRY_CODES.has(value));

const currency = z
  .string()
  .trim()
  .regex(/^[a-z]{3}$/i)
  .transform((value) => value.toUpperCase())
  .refine((value) => INVOICE_CURRENCY_CODES.has(value));

const timezone = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => SUPPORTED_TIMEZONE_IDS.has(value));

const sharedProfileFields = {
  name: requiredText(120),
  legalName: optionalText(160),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: optionalText(40),
  taxId: optionalText(80),
  addressLine2: optionalText(160),
  region: optionalText(100),
  countryCode,
  currency,
  timezone,
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,11}$/i)
    .transform((value) => value.toUpperCase()),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  paymentInstructions: optionalText(1000),
  invoiceFooter: optionalText(1000),
};

export const setupBusinessProfileSchema = z.object({
  ...sharedProfileFields,
  addressLine1: requiredText(160),
  city: requiredText(100),
  postalCode: requiredText(24),
});

export const settingsBusinessProfileSchema = z.object({
  ...sharedProfileFields,
  addressLine1: optionalText(160),
  city: optionalText(100),
  postalCode: optionalText(24),
});

export function businessProfileFormValues(formData: FormData) {
  return {
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    taxId: formData.get("taxId"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2"),
    city: formData.get("city"),
    region: formData.get("region"),
    postalCode: formData.get("postalCode"),
    countryCode: formData.get("countryCode"),
    currency: formData.get("currency"),
    timezone: formData.get("timezone"),
    invoicePrefix: formData.get("invoicePrefix"),
    paymentTermsDays: formData.get("paymentTermsDays"),
    paymentInstructions: formData.get("paymentInstructions"),
    invoiceFooter: formData.get("invoiceFooter"),
  };
}

type BusinessProfileValues = z.output<typeof settingsBusinessProfileSchema>;

export function toBusinessProfileUpdate(
  profile: BusinessProfileValues,
): BusinessProfileUpdate {
  return {
    name: profile.name,
    legal_name: profile.legalName,
    email: profile.email,
    phone: profile.phone,
    tax_id: profile.taxId,
    address_line_1: profile.addressLine1,
    address_line_2: profile.addressLine2,
    city: profile.city,
    region: profile.region,
    postal_code: profile.postalCode,
    country_code: profile.countryCode,
    currency: profile.currency,
    timezone: profile.timezone,
    invoice_prefix: profile.invoicePrefix,
    default_payment_terms_days: profile.paymentTermsDays,
    payment_instructions: profile.paymentInstructions,
    invoice_footer: profile.invoiceFooter,
  };
}
