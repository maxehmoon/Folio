import type { ExpenseFormValues } from "@/features/expenses/schema";

export type { ExpenseFormValues } from "@/features/expenses/schema";

export type ExpenseFormField = keyof ExpenseFormValues;
export type ExpenseFormErrorField = ExpenseFormField | "receipt_image";

export type ExpenseFormState = {
  message?: string;
  errors?: Partial<Record<ExpenseFormErrorField, string[]>>;
  values?: ExpenseFormValues;
};

export const emptyExpenseFormState: ExpenseFormState = {};
