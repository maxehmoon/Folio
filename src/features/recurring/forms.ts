import {
  FormSubmissionError,
  type SubmittedInvoiceLine,
} from "@/features/invoices/forms";
import {
  InvoiceLineInputError,
  parseSubmittedInvoiceLines,
} from "@/features/invoices/line-input";
import type { RecurrenceFrequency } from "@/lib/db/types";
import { INVOICE_CURRENCY_CODES } from "@/lib/currencies";
import { occurrenceAt } from "@/lib/finance/recurrence";
import { isIsoDate } from "@/lib/iso-date";

export type SubmittedRecurringInvoice = {
  customerId: string;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  startsOn: string;
  endsOn: string | null;
  paymentTermsDays: number;
  currency: string;
  notes: string | null;
  paymentInstructions: string | null;
  lines: SubmittedInvoiceLine[];
};

const frequencies = new Set<RecurrenceFrequency>([
  "day",
  "week",
  "month",
  "year",
]);
function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new FormSubmissionError(`${label} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maximum) {
    throw new FormSubmissionError(`${label} is too long`);
  }
  return trimmed;
}

function optionalText(
  value: unknown,
  label: string,
  maximum: number,
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.length > maximum) {
    throw new FormSubmissionError(`${label} is too long`);
  }
  return trimmed;
}

function parseDate(value: string, label: string, required: true): string;
function parseDate(value: string, label: string, required?: false): string | null;
function parseDate(
  value: string,
  label: string,
  required = false,
): string | null {
  const trimmed = value.trim();
  if (!trimmed && !required) return null;
  if (!isIsoDate(trimmed)) {
    throw new FormSubmissionError(`${label} must be a valid date`);
  }
  return trimmed;
}

function parseInteger(
  value: string,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (!/^\d+$/.test(value.trim())) {
    throw new FormSubmissionError(`${label} must be a whole number`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new FormSubmissionError(
      `${label} must be between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

export function parseRecurringInvoiceFormData(
  formData: FormData,
): SubmittedRecurringInvoice {
  const frequency = readString(formData, "frequency") as RecurrenceFrequency;
  if (!frequencies.has(frequency)) {
    throw new FormSubmissionError("Choose a valid frequency");
  }

  const startsOn = parseDate(
    readString(formData, "startsOn"),
    "Start date",
    true,
  );
  const endsOn = parseDate(readString(formData, "endsOn"), "End date");
  if (endsOn && endsOn < startsOn) {
    throw new FormSubmissionError("End date cannot be before the start date");
  }

  const currency = requiredText(
    readString(formData, "currency"),
    "Currency",
    3,
  ).toUpperCase();
  if (!INVOICE_CURRENCY_CODES.has(currency)) {
    throw new FormSubmissionError("Choose a supported currency");
  }

  const intervalCount = parseInteger(
    readString(formData, "intervalCount"),
    "Interval",
    1,
    1_000,
  );

  try {
    occurrenceAt(
      { startsOn, endsOn, frequency, intervalCount },
      0,
    );
  } catch {
    throw new FormSubmissionError("Check the recurrence schedule");
  }

  let lines: SubmittedInvoiceLine[];
  try {
    lines = parseSubmittedInvoiceLines(
      readString(formData, "lines"),
      "recurring invoice",
    );
  } catch (error) {
    if (error instanceof InvoiceLineInputError) {
      throw new FormSubmissionError(error.message);
    }
    throw error;
  }

  return {
    customerId: requiredText(
      readString(formData, "customerId"),
      "Customer",
      100,
    ),
    frequency,
    intervalCount,
    startsOn,
    endsOn,
    paymentTermsDays: parseInteger(
      readString(formData, "paymentTermsDays"),
      "Payment terms",
      0,
      3_650,
    ),
    currency,
    notes: optionalText(readString(formData, "notes"), "Notes", 5_000),
    paymentInstructions: optionalText(
      readString(formData, "paymentInstructions"),
      "Payment instructions",
      2_000,
    ),
    lines,
  };
}
