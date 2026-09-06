import { describe, expect, it } from "vitest";

import {
  expenseFormSchema,
  parseExpenseListFilters,
} from "./schema";

const validExpense = {
  vendor: "Paper & Pen Ltd",
  category: "Office",
  description: "Printer paper",
  expense_date: "2026-07-22",
  currency: "gbp",
  subtotal: "12.50",
  tax: "2.50",
  reference: "RCPT-42",
  notes: "Quarterly stationery order",
};

describe("expenseFormSchema", () => {
  it("normalises currency and blank optional fields", () => {
    const result = expenseFormSchema.parse({
      ...validExpense,
      currency: " eur ",
      description: " ",
      reference: "",
      notes: "",
    });

    expect(result).toMatchObject({
      currency: "EUR",
      description: null,
      reference: null,
      notes: null,
    });
  });

  it("rejects fractional cents and zero-value expenses", () => {
    const fractional = expenseFormSchema.safeParse({
      ...validExpense,
      subtotal: "12.345",
    });
    const zero = expenseFormSchema.safeParse({
      ...validExpense,
      subtotal: "0",
      tax: "0.00",
    });

    expect(fractional.success).toBe(false);
    expect(zero.success).toBe(false);
  });

  it("keeps amounts within the portable database integer range", () => {
    const singleAmount = expenseFormSchema.safeParse({
      ...validExpense,
      subtotal: "21474836.48",
    });
    const combinedTotal = expenseFormSchema.safeParse({
      ...validExpense,
      subtotal: "20000000.00",
      tax: "2000000.00",
    });

    expect(singleAmount.success).toBe(false);
    expect(combinedTotal.success).toBe(false);
  });

  it("rejects impossible dates", () => {
    const result = expenseFormSchema.safeParse({
      ...validExpense,
      expense_date: "2026-02-31",
    });

    expect(result.success).toBe(false);
  });
});

describe("parseExpenseListFilters", () => {
  it("uses safe pagination defaults", () => {
    expect(
      parseExpenseListFilters({ page: "-2", limit: "500" }),
    ).toEqual({ q: "", category: "", page: 1, limit: 25 });
  });

  it("preserves supported filters and limits", () => {
    expect(
      parseExpenseListFilters({
        q: "paper",
        category: "Office",
        page: "3",
        limit: "50",
      }),
    ).toEqual({ q: "paper", category: "Office", page: 3, limit: 50 });
  });
});
