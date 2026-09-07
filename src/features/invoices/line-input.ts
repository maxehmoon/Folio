import { calculateInvoiceTotals, calculateLine } from "@/lib/finance/money";

import { parseQuantity } from "./calculations";

const MAX_DATABASE_INTEGER = 2_147_483_647;

export type SubmittedInvoiceLine = {
  itemId: string | null;
  description: string;
  details: string | null;
  unit: string;
  quantityThousandths: number;
  unitPriceCents: number;
  taxRateBps: number;
};

export class InvoiceLineInputError extends Error {}

function requiredText(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new InvoiceLineInputError(`${label} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maximum) {
    throw new InvoiceLineInputError(`${label} is too long`);
  }
  return trimmed;
}

function optionalText(value: unknown, label: string, maximum: number) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new InvoiceLineInputError(`${label} is invalid`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maximum) {
    throw new InvoiceLineInputError(`${label} is too long`);
  }
  return trimmed;
}

export function parseScaledDecimal(
  value: unknown,
  decimalPlaces: number,
  maximum = MAX_DATABASE_INTEGER,
) {
  if (typeof value !== "string") return null;
  const match = new RegExp(`^(\\d+)(?:\\.(\\d{1,${decimalPlaces}}))?$`).exec(
    value.trim(),
  );
  if (!match) return null;

  const scale = BigInt(10 ** decimalPlaces);
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(decimalPlaces, "0"));
  const scaled = whole * scale + fraction;
  if (scaled > BigInt(maximum)) return null;
  return Number(scaled);
}

function parseLineDecimal(
  value: unknown,
  label: string,
  maximum = MAX_DATABASE_INTEGER,
) {
  const parsed = parseScaledDecimal(value, 2, maximum);
  if (parsed == null) {
    if (
      typeof value === "string" &&
      /^\d+(?:\.\d{1,2})?$/.test(value.trim())
    ) {
      throw new InvoiceLineInputError(`${label} is too large`);
    }
    throw new InvoiceLineInputError(
      `${label} must be a valid amount with no more than 2 decimal places`,
    );
  }
  return parsed;
}

export function parseSubmittedInvoiceLines(
  value: string,
  subject: "invoice" | "recurring invoice" = "invoice",
): SubmittedInvoiceLine[] {
  let rawLines: unknown;
  try {
    rawLines = JSON.parse(value);
  } catch {
    throw new InvoiceLineInputError(
      `${subject === "invoice" ? "Invoice" : "Recurring invoice"} lines could not be read`,
    );
  }

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new InvoiceLineInputError("Add at least one line");
  }
  if (rawLines.length > 100) {
    throw new InvoiceLineInputError(
      `${subject === "invoice" ? "An invoice" : "A recurring invoice"} can contain at most 100 lines`,
    );
  }

  const lines = rawLines.map((line, index): SubmittedInvoiceLine => {
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      throw new InvoiceLineInputError(`Line ${index + 1} is invalid`);
    }
    const values = line as Record<string, unknown>;
    let quantityThousandths: number;
    try {
      quantityThousandths = parseQuantity(String(values.quantity ?? ""));
    } catch (error) {
      throw new InvoiceLineInputError(
        `Line ${index + 1}: ${error instanceof Error ? error.message : "quantity is invalid"}`,
      );
    }
    if (quantityThousandths > MAX_DATABASE_INTEGER) {
      throw new InvoiceLineInputError(`Line ${index + 1} quantity is too large`);
    }

    return {
      itemId: optionalText(values.itemId, "Item", 100),
      description: requiredText(
        values.description,
        `Line ${index + 1} item name`,
        500,
      ),
      details: optionalText(values.details, `Line ${index + 1} description`, 5_000),
      unit: requiredText(values.unit, `Line ${index + 1} unit`, 40),
      quantityThousandths,
      unitPriceCents: parseLineDecimal(
        values.unitPrice,
        `Line ${index + 1} unit price`,
      ),
      taxRateBps: parseLineDecimal(values.taxRate, "Tax rate", 10_000),
    };
  });

  try {
    calculateInvoiceTotals(lines.map(calculateLine));
  } catch (error) {
    if (error instanceof RangeError) {
      throw new InvoiceLineInputError("One or more line amounts are too large");
    }
    throw error;
  }

  return lines;
}
