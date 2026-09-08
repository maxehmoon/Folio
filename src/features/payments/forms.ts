import type { PaymentMethod } from "@/lib/db/types";
import { parseMoneyInput } from "@/lib/finance/money";
import { isIsoDate } from "@/lib/iso-date";

export type PaymentActionState = {
  error?: string;
  success?: string;
};

export type SubmittedPayment = {
  invoiceId: string;
  currency: string;
  paymentDate: string;
  amountCents: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
};

export class PaymentFormError extends Error {}

const PAYMENT_METHODS = new Set<PaymentMethod>([
  "bank_transfer",
  "card",
  "cash",
  "cheque",
  "other",
]);

export function ensurePaymentFitsBalance(
  amountCents: number,
  balanceDueCents: number,
): void {
  if (
    !Number.isSafeInteger(amountCents) ||
    !Number.isSafeInteger(balanceDueCents) ||
    amountCents <= 0 ||
    balanceDueCents < 0
  ) {
    throw new PaymentFormError("Payment balance is invalid");
  }
  if (amountCents > balanceDueCents) {
    throw new PaymentFormError(
      "Payment amount cannot be greater than the amount due",
    );
  }
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function requiredText(value: string, label: string, maximum: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new PaymentFormError(`${label} is required`);
  if (trimmed.length > maximum) {
    throw new PaymentFormError(`${label} is too long`);
  }
  return trimmed;
}

function optionalText(value: string, label: string, maximum: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maximum) {
    throw new PaymentFormError(`${label} is too long`);
  }
  return trimmed;
}

export function parsePaymentFormData(formData: FormData): SubmittedPayment {
  const currency = readString(formData, "currency").trim();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new PaymentFormError("Refresh the page and choose an invoice currency");
  }
  const method = readString(formData, "method") as PaymentMethod;
  if (!PAYMENT_METHODS.has(method)) {
    throw new PaymentFormError("Choose a valid payment method");
  }

  const paymentDate = readString(formData, "paymentDate").trim();
  if (!isIsoDate(paymentDate)) {
    throw new PaymentFormError("Payment date must be a valid date");
  }

  let amountCents: number;
  try {
    amountCents = parseMoneyInput(readString(formData, "amount"));
  } catch {
    throw new PaymentFormError(
      "Payment amount must be a non-negative amount with up to two decimals",
    );
  }
  if (amountCents <= 0) {
    throw new PaymentFormError("Payment amount must be greater than zero");
  }

  return {
    invoiceId: requiredText(readString(formData, "invoiceId"), "Invoice", 100),
    currency,
    paymentDate,
    amountCents,
    method,
    reference: optionalText(readString(formData, "reference"), "Reference", 200),
    notes: optionalText(readString(formData, "notes"), "Notes", 2_000),
  };
}
