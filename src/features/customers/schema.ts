import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/countries";
import { INVOICE_CURRENCY_CODES } from "@/lib/currencies";
import { listPageLimitSchema } from "@/lib/list-pagination";

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maximum).nullable(),
  );

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().email("Enter a valid email address.").max(254).nullable(),
);

const optionalCountryCode = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z
    .string()
    .trim()
    .length(2, "Use a two-letter country code.")
    .transform((value) => value.toUpperCase())
    .refine((value) => COUNTRY_CODES.has(value), "Choose a valid country.")
    .nullable(),
);

const optionalCurrency = z.preprocess(
  (value) =>
    value == null || (typeof value === "string" && value.trim() === "")
      ? null
      : value,
  z
    .string()
    .trim()
    .length(3, "Choose a valid currency.")
    .transform((value) => value.toUpperCase())
    .refine((value) => INVOICE_CURRENCY_CODES.has(value), "Choose a supported currency.")
    .nullable(),
);

export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a customer name.")
    .max(160, "Keep the customer name under 160 characters."),
  billing_name: optionalText(160).default(null),
  contact_name: optionalText(160),
  email: optionalEmail,
  phone: optionalText(40),
  tax_id: optionalText(80),
  address_line_1: optionalText(200),
  address_line_2: optionalText(200),
  city: optionalText(120),
  region: optionalText(120),
  postal_code: optionalText(32),
  country_code: optionalCountryCode,
  default_currency: optionalCurrency,
  notes: optionalText(2_000),
});

export const customerIdSchema = z.string().uuid();

export const customerListSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum(["active", "archived", "all"]).catch("active"),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  limit: listPageLimitSchema,
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerListFilters = z.infer<typeof customerListSchema>;
export type CustomerListStatus = CustomerListFilters["status"];

export function parseCustomerListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): CustomerListFilters {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  return customerListSchema.parse({
    q: first(searchParams.q),
    status: first(searchParams.status),
    page: first(searchParams.page),
    limit: first(searchParams.limit),
  });
}
