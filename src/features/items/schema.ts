import { z } from "zod"

import { parseMoneyToCents } from "@/lib/format"
import { INVOICE_CURRENCY_CODES } from "@/lib/currencies"
import { listPageLimitSchema } from "@/lib/list-pagination"

const MAX_DATABASE_INTEGER = 2_147_483_647

function decimalHundredthsSchema(label: string, maximum: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value, context) => {
      const hundredths = parseMoneyToCents(value)

      if (hundredths === null) {
        context.addIssue({
          code: "custom",
          message: `Enter ${label.toLowerCase()} with no more than two decimal places.`,
        })
        return z.NEVER
      }

      if (hundredths > maximum) {
        context.addIssue({
          code: "too_big",
          maximum,
          origin: "number",
          inclusive: true,
          message: `${label} is too large.`,
        })
        return z.NEVER
      }

      return hundredths
    })
}

const optionalDescriptionSchema = z
  .string()
  .trim()
  .max(1_000, "Description must be 1,000 characters or fewer.")
  .transform((value) => (value.length > 0 ? value : null))

const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^[A-Z]{3}$/, "Choose a supported currency.")
      .refine((value) => INVOICE_CURRENCY_CODES.has(value), "Choose a supported currency."),
  )

export const itemFormSchema = z.object({
  currency: currencySchema,
  description: optionalDescriptionSchema,
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(120, "Name must be 120 characters or fewer."),
  taxRate: decimalHundredthsSchema("Tax rate", 10_000),
  unit: z
    .string()
    .trim()
    .min(1, "Unit is required.")
    .max(40, "Unit must be 40 characters or fewer."),
  unitPrice: decimalHundredthsSchema("Unit price", MAX_DATABASE_INTEGER),
})

export type ItemFormValues = z.input<typeof itemFormSchema>
export type ItemFormField = keyof ItemFormValues

export type ItemFormState = {
  fieldErrors?: Partial<Record<ItemFormField, string[]>>
  message?: string
  values?: ItemFormValues
}

export const itemIdSchema = z.string().uuid()

export const itemStatusSchema = z.enum(["active", "archived", "all"])

const listCurrencySchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return undefined

    const currency = value.trim()
    return currency && currency.toLowerCase() !== "all" ? currency : undefined
  },
  currencySchema.optional(),
)

export const itemListSearchSchema = z.object({
  currency: listCurrencySchema.catch(undefined),
  limit: listPageLimitSchema,
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  q: z.string().trim().max(100).catch(""),
  status: itemStatusSchema.catch("active"),
})

export type ItemListSearch = z.output<typeof itemListSearchSchema>

export function readItemFormValues(formData: FormData): ItemFormValues {
  const text = (name: ItemFormField) => {
    const value = formData.get(name)
    return typeof value === "string" ? value : ""
  }

  return {
    currency: text("currency"),
    description: text("description"),
    name: text("name"),
    taxRate: text("taxRate"),
    unit: text("unit"),
    unitPrice: text("unitPrice"),
  }
}

export function parseItemListSearch(
  searchParams: Record<string, string | string[] | undefined>,
): ItemListSearch {
  const first = (key: string) => {
    const value = searchParams[key]
    return Array.isArray(value) ? value[0] : value
  }

  return itemListSearchSchema.parse({
    currency: first("currency"),
    limit: first("limit"),
    page: first("page"),
    q: first("q"),
    status: first("status"),
  })
}
