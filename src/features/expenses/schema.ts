import { z } from "zod";

import { parseMoneyToCents } from "../../lib/format";
import { INVOICE_CURRENCY_CODES } from "../../lib/currencies";
import { listPageLimitSchema } from "@/lib/list-pagination";

const MAX_DATABASE_INTEGER = 2_147_483_647;

const optionalText = (maximum: number, message: string) =>
  z
    .string()
    .trim()
    .max(maximum, message)
    .transform((value) => value || null);

const moneyInput = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine(
      (value) => parseMoneyToCents(value) !== null,
      `${label} must be a non-negative amount with no more than two decimal places.`,
    )
    .refine((value) => {
      const cents = parseMoneyToCents(value);
      return cents === null || cents <= MAX_DATABASE_INTEGER;
    }, `${label} is too large.`);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid expense date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "Choose a valid expense date.");

export const expenseIdSchema = z.string().uuid("Invalid expense.");

export const expenseFormSchema = z
  .object({
    vendor: z
      .string()
      .trim()
      .min(1, "Vendor is required.")
      .max(160, "Vendor must be 160 characters or fewer."),
    category: z
      .string()
      .trim()
      .min(1, "Category is required.")
      .max(80, "Category must be 80 characters or fewer."),
    description: optionalText(500, "Description must be 500 characters or fewer."),
    expense_date: isoDate,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Choose a supported currency.")
      .refine((value) => INVOICE_CURRENCY_CODES.has(value), "Choose a supported currency."),
    subtotal: moneyInput("Subtotal"),
    tax: moneyInput("Tax"),
    reference: optionalText(120, "Reference must be 120 characters or fewer."),
    notes: optionalText(2_000, "Notes must be 2,000 characters or fewer."),
  })
  .superRefine((value, context) => {
    const subtotal = parseMoneyToCents(value.subtotal);
    const tax = parseMoneyToCents(value.tax);
    if (subtotal === null || tax === null) return;
    if (subtotal + tax > MAX_DATABASE_INTEGER) {
      context.addIssue({
        code: "custom",
        message: "The expense total is too large for the selected database.",
        path: ["subtotal"],
      });
    } else if (subtotal + tax <= 0) {
      context.addIssue({
        code: "custom",
        message: "The expense total must be greater than zero.",
        path: ["subtotal"],
      });
    }
  });

export const expenseListSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  category: z.string().trim().max(80).catch(""),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  limit: listPageLimitSchema,
});

export type ExpenseFormInput = z.infer<typeof expenseFormSchema>;
export type ExpenseFormValues = z.input<typeof expenseFormSchema>;
export type ExpenseListFilters = z.infer<typeof expenseListSchema>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseExpenseListFilters(
  input: Record<string, string | string[] | undefined>,
): ExpenseListFilters {
  return expenseListSchema.parse({
    q: firstValue(input.q),
    category: firstValue(input.category),
    page: firstValue(input.page),
    limit: firstValue(input.limit),
  });
}
