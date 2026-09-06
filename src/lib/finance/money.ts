import type { InvoiceLifecycle, InvoiceStatus } from "@/lib/db/types";

// Domain migrations use PostgreSQL's 32-bit `integer` type so both supported
// databases share this conservative upper bound for monetary minor units.
const MAX_DATABASE_INTEGER = 2_147_483_647;

export interface LineCalculationInput {
  quantityThousandths: number;
  unitPriceCents: number;
  taxRateBps: number;
}

export interface LineTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

function requireSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer.`);
  }
}

function safeNumber(value: bigint, name: string): number {
  const number = Number(value);
  requireSafeInteger(number, name);
  if (number > MAX_DATABASE_INTEGER) {
    throw new RangeError(`${name} is too large for the selected database.`);
  }
  return number;
}

function divideAndRound(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === BigInt(0)) return quotient;

  const absoluteRemainder = remainder < BigInt(0) ? -remainder : remainder;
  const absoluteDenominator = denominator < BigInt(0) ? -denominator : denominator;
  if (absoluteRemainder * BigInt(2) < absoluteDenominator) return quotient;
  return quotient +
    (numerator < BigInt(0) === denominator < BigInt(0) ? BigInt(1) : BigInt(-1));
}

export function calculateLine(input: LineCalculationInput): LineTotals {
  const { quantityThousandths, unitPriceCents, taxRateBps } = input;
  requireSafeInteger(quantityThousandths, "quantityThousandths");
  requireSafeInteger(unitPriceCents, "unitPriceCents");
  requireSafeInteger(taxRateBps, "taxRateBps");

  if (quantityThousandths <= 0) {
    throw new RangeError("quantityThousandths must be greater than zero.");
  }
  if (unitPriceCents < 0) {
    throw new RangeError("unitPriceCents cannot be negative.");
  }
  if (taxRateBps < 0 || taxRateBps > 10_000) {
    throw new RangeError("taxRateBps must be between 0 and 10000.");
  }

  const subtotal = divideAndRound(
    BigInt(quantityThousandths) * BigInt(unitPriceCents),
    BigInt(1_000),
  );
  const tax = divideAndRound(subtotal * BigInt(taxRateBps), BigInt(10_000));
  const total = subtotal + tax;

  return {
    subtotalCents: safeNumber(subtotal, "subtotalCents"),
    taxCents: safeNumber(tax, "taxCents"),
    totalCents: safeNumber(total, "totalCents"),
  };
}

export function calculateInvoiceTotals(
  lines: readonly Pick<LineTotals, "subtotalCents" | "taxCents" | "totalCents">[],
): LineTotals {
  let subtotal = BigInt(0);
  let tax = BigInt(0);
  let total = BigInt(0);

  for (const line of lines) {
    requireSafeInteger(line.subtotalCents, "line.subtotalCents");
    requireSafeInteger(line.taxCents, "line.taxCents");
    requireSafeInteger(line.totalCents, "line.totalCents");
    if (
      line.subtotalCents < 0 ||
      line.taxCents < 0 ||
      line.totalCents !== line.subtotalCents + line.taxCents
    ) {
      throw new RangeError("Line totals must be non-negative and internally consistent.");
    }
    subtotal += BigInt(line.subtotalCents);
    tax += BigInt(line.taxCents);
    total += BigInt(line.totalCents);
  }

  return {
    subtotalCents: safeNumber(subtotal, "subtotalCents"),
    taxCents: safeNumber(tax, "taxCents"),
    totalCents: safeNumber(total, "totalCents"),
  };
}

export function invoiceBalance(totalCents: number, paidCents: number): number {
  requireSafeInteger(totalCents, "totalCents");
  requireSafeInteger(paidCents, "paidCents");
  if (totalCents < 0 || paidCents < 0) {
    throw new RangeError("Invoice and payment totals cannot be negative.");
  }
  return Math.max(0, totalCents - paidCents);
}

export function deriveInvoiceStatus(input: {
  lifecycle: InvoiceLifecycle;
  dueDate: string | null;
  totalCents: number;
  paidCents: number;
  today: string;
}): InvoiceStatus {
  if (input.lifecycle === "draft") return "draft";
  if (input.lifecycle === "void") return "void";
  if (invoiceBalance(input.totalCents, input.paidCents) === 0) return "paid";
  if (input.dueDate && input.dueDate < input.today) return "overdue";
  if (input.paidCents > 0) return "partially_paid";
  return "issued";
}

export function parseMoneyInput(value: string): number {
  const normalised = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalised);
  if (!match) {
    throw new TypeError("Money must be a non-negative amount with up to two decimals.");
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  return safeNumber(whole * BigInt(100) + fraction, "money amount");
}
