"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import type { ExpenseUpdate, NewExpense } from "@/lib/db/types";
import { db, newId, nowIso } from "@/lib/db";
import { parseMoneyToCents } from "@/lib/format";
import { requireBusiness } from "@/lib/session";
import type {
  ExpenseFormField,
  ExpenseFormErrorField,
  ExpenseFormState,
  ExpenseFormValues,
} from "@/features/expenses/form-state";
import {
  receiptColumns,
  receiptImageUpload,
} from "@/features/expenses/receipt";
import {
  expenseFormSchema,
  expenseIdSchema,
  type ExpenseFormInput,
} from "@/features/expenses/schema";
import { readImageUpload } from "@/lib/read-image-upload";

function formValues(formData: FormData): ExpenseFormValues {
  const text = (name: ExpenseFormField) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    vendor: text("vendor"),
    category: text("category"),
    description: text("description"),
    expense_date: text("expense_date"),
    currency: text("currency"),
    subtotal: text("subtotal"),
    tax: text("tax"),
    reference: text("reference"),
    notes: text("notes"),
  };
}

function expenseValues(input: ExpenseFormInput) {
  const subtotalCents = parseMoneyToCents(input.subtotal);
  const taxCents = parseMoneyToCents(input.tax);

  if (subtotalCents === null || taxCents === null) {
    throw new Error("Validated expense amounts could not be parsed.");
  }

  return {
    vendor: input.vendor,
    category: input.category,
    description: input.description,
    expense_date: input.expense_date,
    currency: input.currency,
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: subtotalCents + taxCents,
    reference: input.reference,
    notes: input.notes,
  };
}

function validationState(
  error: {
    flatten: () => {
      fieldErrors: Partial<Record<ExpenseFormErrorField, string[]>>;
    };
  },
  values: ExpenseFormValues,
): ExpenseFormState {
  return {
    message: "Check the highlighted fields and try again.",
    errors: error.flatten().fieldErrors,
    values,
  };
}

function receiptValidationState(
  error: string,
  values: ExpenseFormValues,
): ExpenseFormState {
  return {
    message: "Check the highlighted fields and try again.",
    errors: { receipt_image: [error] },
    values,
  };
}

export async function createExpense(
  _state: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const business = await requireBusiness();
  const values = formValues(formData);
  const parsed = expenseFormSchema.safeParse(values);
  if (!parsed.success) return validationState(parsed.error, values);
  const receipt = await readImageUpload(formData, receiptImageUpload);
  if (receipt.kind === "invalid") {
    return receiptValidationState(receipt.error, values);
  }

  const timestamp = nowIso();
  const expense: NewExpense = {
    id: newId(),
    business_id: business.id,
    ...expenseValues(parsed.data),
    ...receiptColumns(
      { receipt_data_url: null, receipt_url: null },
      receipt,
    ),
    created_at: timestamp,
    updated_at: timestamp,
  };

  await db.insertInto("expenses").values(expense).executeTakeFirstOrThrow();

  revalidatePath("/expenses");
  redirect("/expenses?notice=created");
}

export async function updateExpense(
  expenseId: string,
  _state: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const business = await requireBusiness();
  const id = expenseIdSchema.safeParse(expenseId);
  if (!id.success) notFound();

  const values = formValues(formData);
  const parsed = expenseFormSchema.safeParse(values);
  if (!parsed.success) return validationState(parsed.error, values);
  const receipt = await readImageUpload(formData, receiptImageUpload);
  if (receipt.kind === "invalid") {
    return receiptValidationState(receipt.error, values);
  }

  const existing = await db
    .selectFrom("expenses")
    .select(["receipt_url", "receipt_data_url"])
    .where("id", "=", id.data)
    .where("business_id", "=", business.id)
    .executeTakeFirst();

  if (!existing) notFound();

  const changes: ExpenseUpdate = {
    ...expenseValues(parsed.data),
    ...receiptColumns(existing, receipt),
    updated_at: nowIso(),
  };

  await db
    .updateTable("expenses")
    .set(changes)
    .where("id", "=", id.data)
    .where("business_id", "=", business.id)
    .executeTakeFirst();

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${id.data}`);
  redirect(`/expenses/${id.data}?notice=updated`);
}

export async function deleteExpense(formData: FormData): Promise<void> {
  const business = await requireBusiness();
  const id = expenseIdSchema.safeParse(formData.get("id"));
  if (!id.success) notFound();
  if (formData.get("confirm") !== "yes") {
    redirect(`/expenses/${id.data}?error=confirm-delete`);
  }

  const result = await db
    .deleteFrom("expenses")
    .where("id", "=", id.data)
    .where("business_id", "=", business.id)
    .executeTakeFirst();

  if (Number(result.numDeletedRows) === 0) notFound();

  revalidatePath("/expenses");
  redirect("/expenses?notice=deleted");
}
