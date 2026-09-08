import { calculateLine } from "@/lib/finance/money";

import { parseQuantity } from "./calculations";
import { parseScaledDecimal } from "./line-input";

export type InvoiceLineEditorValue = {
  key: string;
  itemId: string | null;
  description: string;
  details?: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

export function formatScaledDecimal(
  value: number,
  decimalPlaces: number,
  trimTrailingZeros = true,
) {
  const scale = 10 ** decimalPlaces;
  const formatted = (value / scale).toFixed(decimalPlaces);
  return trimTrailingZeros ? formatted.replace(/\.?0+$/, "") : formatted;
}

export function estimateInvoiceLine(line: InvoiceLineEditorValue) {
  try {
    const unitPriceCents = parseScaledDecimal(line.unitPrice, 2);
    const taxRateBps = parseScaledDecimal(line.taxRate, 2, 10_000);
    if (unitPriceCents == null || taxRateBps == null) return null;
    return calculateLine({
      quantityThousandths: parseQuantity(line.quantity),
      unitPriceCents,
      taxRateBps,
    });
  } catch {
    return null;
  }
}

export function totalEditorLines(lines: readonly InvoiceLineEditorValue[]) {
  const estimates = lines.map(estimateInvoiceLine);
  return estimates.reduce<{
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
  }>(
    (sum, estimate) => ({
      subtotalCents: sum.subtotalCents + (estimate?.subtotalCents ?? 0),
      taxCents: sum.taxCents + (estimate?.taxCents ?? 0),
      totalCents: sum.totalCents + (estimate?.totalCents ?? 0),
    }),
    { subtotalCents: 0, taxCents: 0, totalCents: 0 },
  );
}

export function serialiseInvoiceLines(lines: readonly InvoiceLineEditorValue[]) {
  return JSON.stringify(
    lines.map(({ itemId, description, details, unit, quantity, unitPrice, taxRate }) => ({
      itemId,
      description,
      details,
      unit,
      quantity,
      unitPrice,
      taxRate,
    })),
  );
}

export function emptyInvoiceLine(key: string): InvoiceLineEditorValue {
  return {
    key,
    itemId: null,
    description: "",
    details: "",
    unit: "each",
    quantity: "1",
    unitPrice: "0.00",
    taxRate: "0",
  };
}

export type ConversionRequest = {
  id: number;
  lineKey: string;
  currency: string;
};

export type InvoiceLineEditorState = {
  lines: InvoiceLineEditorValue[];
  currency: string;
  conversion: ConversionRequest | null;
  exchangeNotice: string | null;
  exchangeError: string | null;
};

export type InvoiceLineEditorAction =
  | { type: "add"; line: InvoiceLineEditorValue }
  | { type: "remove"; key: string }
  | { type: "update"; key: string; update: Partial<InvoiceLineEditorValue> }
  | { type: "currency"; currency: string }
  | { type: "conversion-started"; request: ConversionRequest }
  | {
      type: "conversion-succeeded";
      request: ConversionRequest;
      update: Partial<InvoiceLineEditorValue>;
      notice: string;
    }
  | { type: "conversion-failed"; request: ConversionRequest; message: string }
  | { type: "conversion-cancelled"; lineKey?: string };

function isCurrentConversion(
  state: InvoiceLineEditorState,
  request: ConversionRequest,
) {
  return (
    state.currency === request.currency &&
    state.conversion?.id === request.id &&
    state.conversion.lineKey === request.lineKey
  );
}

export function invoiceLineEditorReducer(
  state: InvoiceLineEditorState,
  action: InvoiceLineEditorAction,
): InvoiceLineEditorState {
  switch (action.type) {
    case "add":
      return { ...state, lines: [...state.lines, action.line] };
    case "remove":
      return {
        ...state,
        lines: state.lines.filter((line) => line.key !== action.key),
        conversion:
          state.conversion?.lineKey === action.key ? null : state.conversion,
      };
    case "update":
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.key === action.key ? { ...line, ...action.update } : line,
        ),
        conversion:
          state.conversion?.lineKey === action.key ? null : state.conversion,
      };
    case "currency":
      if (action.currency === state.currency) return state;
      return {
        ...state,
        currency: action.currency,
        conversion: null,
        exchangeNotice: null,
        exchangeError: null,
        lines: state.lines.map((line) => ({ ...line, itemId: null })),
      };
    case "conversion-started":
      return {
        ...state,
        conversion: action.request,
        exchangeError: null,
      };
    case "conversion-succeeded":
      if (!isCurrentConversion(state, action.request)) return state;
      return {
        ...state,
        conversion: null,
        exchangeError: null,
        exchangeNotice: action.notice,
        lines: state.lines.map((line) =>
          line.key === action.request.lineKey
            ? { ...line, ...action.update }
            : line,
        ),
      };
    case "conversion-failed":
      if (!isCurrentConversion(state, action.request)) return state;
      return {
        ...state,
        conversion: null,
        exchangeError: action.message,
      };
    case "conversion-cancelled":
      if (action.lineKey && state.conversion?.lineKey !== action.lineKey) {
        return state;
      }
      return { ...state, conversion: null };
  }
}

export type ExchangeRateResponse = {
  date: string;
  rateMicros: number;
  source: string;
};

export function parseExchangeRateResponse(value: unknown): ExchangeRateResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid exchange-rate response");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
    typeof record.source !== "string" ||
    !record.source.trim() ||
    !Number.isSafeInteger(record.rateMicros) ||
    Number(record.rateMicros) <= 0
  ) {
    throw new TypeError("Invalid exchange-rate response");
  }
  return {
    date: record.date,
    rateMicros: Number(record.rateMicros),
    source: record.source,
  };
}
