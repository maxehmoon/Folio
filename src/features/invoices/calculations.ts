import type { InvoiceLifecycle, InvoiceStatus } from "@/lib/db/types";
import {
  calculateInvoiceTotals,
  calculateLine,
  deriveInvoiceStatus as deriveSharedInvoiceStatus,
} from "@/lib/finance";

export const QUANTITY_SCALE = 1_000;
export const TAX_RATE_SCALE = 10_000;

export type InvoiceCalculationLine = {
  quantityThousandths: number;
  unitPriceCents: number;
  taxRateBps: number;
};

export type CalculatedInvoiceLine = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
};

export type CalculatedInvoice = CalculatedInvoiceLine;

function assertNonNegativeSafeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}

export function parseQuantity(value: string) {
  const normalised = value.trim();

  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(normalised)) {
    throw new Error("Quantity must be a positive number with up to 3 decimals");
  }

  const [whole, fraction = ""] = normalised.split(".");
  const quantity = Number(whole) * QUANTITY_SCALE + Number(fraction.padEnd(3, "0"));

  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than zero");
  }

  return quantity;
}

export function formatQuantity(quantityThousandths: number) {
  assertNonNegativeSafeInteger(quantityThousandths, "Quantity");

  const whole = Math.floor(quantityThousandths / QUANTITY_SCALE);
  const fraction = String(quantityThousandths % QUANTITY_SCALE)
    .padStart(3, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function calculateInvoiceLine(
  line: InvoiceCalculationLine,
): CalculatedInvoiceLine {
  return calculateLine(line);
}

export function calculateInvoice(
  lines: InvoiceCalculationLine[],
): CalculatedInvoice {
  return calculateInvoiceTotals(lines.map(calculateInvoiceLine));
}

export function deriveInvoiceStatus(input: {
  lifecycle: InvoiceLifecycle;
  totalCents: number;
  paidCents: number;
  dueDate: string | null;
  today: string;
}): InvoiceStatus {
  return deriveSharedInvoiceStatus(input);
}

export function invoiceStatusLabel(status: InvoiceStatus) {
  const labels: Record<InvoiceStatus, string> = {
    draft: "Draft",
    issued: "Outstanding",
    partially_paid: "Part-paid",
    paid: "Paid",
    overdue: "Overdue",
    void: "Void",
  };

  return labels[status];
}
