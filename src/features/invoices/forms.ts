import { INVOICE_CURRENCY_CODES } from "@/lib/currencies";
import { isIsoDate } from "@/lib/iso-date";

import {
  InvoiceLineInputError,
  parseSubmittedInvoiceLines,
  type SubmittedInvoiceLine,
} from "./line-input";

export type InvoiceActionState = {
  error?: string;
};

export type { SubmittedInvoiceLine } from "./line-input";

export type SubmittedInvoice = {
  customerId: string;
  currency: string;
  issueDate: string | null;
  dueDate: string | null;
  exchangeRateMicros: number | null;
  notes: string | null;
  paymentInstructions: string | null;
  lines: SubmittedInvoiceLine[];
};

export class FormSubmissionError extends Error {}

function readString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new FormSubmissionError(`${label} is required`);
  }

  const trimmed = value.trim();
  if (!trimmed) throw new FormSubmissionError(`${label} is required`);
  if (trimmed.length > maxLength) {
    throw new FormSubmissionError(`${label} is too long`);
  }

  return trimmed;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new FormSubmissionError(`${label} is invalid`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new FormSubmissionError(`${label} is too long`);
  }

  return trimmed;
}

function parseDate(value: string, label: string, required = false) {
  const trimmed = value.trim();
  if (!trimmed && !required) return null;
  if (!isIsoDate(trimmed)) {
    throw new FormSubmissionError(`${label} must be a valid date`);
  }

  return trimmed;
}

function parseExchangeRate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(trimmed);
  if (!match) {
    throw new FormSubmissionError(
      "Reporting exchange rate must be a positive number with up to 6 decimal places",
    );
  }
  if (trimmed.length > 32) {
    throw new FormSubmissionError("Reporting exchange rate is too large");
  }

  const rateMicros = Number(
    BigInt(match[1]) * 1_000_000n +
      BigInt((match[2] ?? "").padEnd(6, "0")),
  );
  if (!Number.isSafeInteger(rateMicros) || rateMicros <= 0) {
    throw new FormSubmissionError(
      "Reporting exchange rate must be positive and within the supported range",
    );
  }
  return rateMicros;
}

export function parseInvoiceFormData(formData: FormData): SubmittedInvoice {
  const customerId = requiredText(
    readString(formData, "customerId"),
    "Customer",
    100,
  );
  const currency = requiredText(
    readString(formData, "currency"),
    "Currency",
    3,
  ).toUpperCase();
  if (!INVOICE_CURRENCY_CODES.has(currency)) {
    throw new FormSubmissionError("Choose a supported invoice currency");
  }
  const issueDate = parseDate(readString(formData, "issueDate"), "Issue date");
  const dueDate = parseDate(readString(formData, "dueDate"), "Due date");

  if (issueDate && dueDate && dueDate < issueDate) {
    throw new FormSubmissionError("Due date cannot be before the issue date");
  }

  let lines: SubmittedInvoiceLine[];
  try {
    lines = parseSubmittedInvoiceLines(readString(formData, "lines"));
  } catch (error) {
    if (error instanceof InvoiceLineInputError) {
      throw new FormSubmissionError(error.message);
    }
    throw error;
  }

  return {
    customerId,
    currency,
    issueDate,
    dueDate,
    exchangeRateMicros: parseExchangeRate(readString(formData, "exchangeRate")),
    notes: optionalText(readString(formData, "notes"), "Notes", 5_000),
    paymentInstructions: optionalText(
      readString(formData, "paymentInstructions"),
      "Payment instructions",
      2_000,
    ),
    lines,
  };
}
