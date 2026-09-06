"use client";

import { useEffect, useId, useMemo, useReducer, useRef } from "react";

import { convertCents } from "@/lib/finance/exchange";

import {
  emptyInvoiceLine,
  estimateInvoiceLine,
  formatScaledDecimal,
  invoiceLineEditorReducer,
  parseExchangeRateResponse,
  serialiseInvoiceLines,
  totalEditorLines,
  type ConversionRequest,
  type InvoiceLineEditorValue,
} from "./line-editor-model";

export type InvoiceLineEditorItem = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  unit_price_cents: number;
  tax_rate_bps: number;
  currency: string;
};

export function useInvoiceLines({
  initialCurrency,
  initialLines,
  items,
}: {
  initialCurrency: string;
  initialLines: InvoiceLineEditorValue[];
  items: readonly InvoiceLineEditorItem[];
}) {
  const [state, dispatch] = useReducer(invoiceLineEditorReducer, {
    lines: initialLines,
    currency: initialCurrency,
    conversion: null,
    exchangeNotice: null,
    exchangeError: null,
  });
  const idPrefix = useId();
  const nextKey = useRef(0);
  const nextConversionId = useRef(0);
  const pendingConversion = useRef<{
    controller: AbortController;
    request: ConversionRequest;
  } | null>(null);
  const estimates = useMemo(
    () => state.lines.map(estimateInvoiceLine),
    [state.lines],
  );
  const totals = useMemo(
    () => totalEditorLines(state.lines),
    [state.lines],
  );

  useEffect(
    () => () => {
      pendingConversion.current?.controller.abort();
    },
    [],
  );

  function cancelConversion(lineKey?: string) {
    if (
      lineKey &&
      pendingConversion.current?.request.lineKey !== lineKey
    ) {
      return;
    }
    pendingConversion.current?.controller.abort();
    pendingConversion.current = null;
    dispatch({ type: "conversion-cancelled", lineKey });
  }

  function updateLine(
    key: string,
    update: Partial<InvoiceLineEditorValue>,
  ) {
    cancelConversion(key);
    dispatch({ type: "update", key, update });
  }

  async function selectItem(key: string, itemId: string) {
    if (itemId === "ad-hoc") {
      updateLine(key, { itemId: null });
      return;
    }

    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return;

    const update: Partial<InvoiceLineEditorValue> = {
      itemId: item.id,
      description: item.description?.trim()
        ? `${item.name} — ${item.description}`
        : item.name,
      unit: item.unit,
      taxRate: formatScaledDecimal(item.tax_rate_bps, 2),
    };

    if (item.currency === state.currency) {
      updateLine(key, {
        ...update,
        unitPrice: formatScaledDecimal(item.unit_price_cents, 2, false),
      });
      return;
    }

    cancelConversion();
    const request: ConversionRequest = {
      id: ++nextConversionId.current,
      lineKey: key,
      currency: state.currency,
    };
    const controller = new AbortController();
    pendingConversion.current = { controller, request };
    dispatch({ type: "conversion-started", request });

    try {
      const params = new URLSearchParams({
        base: item.currency,
        quote: state.currency,
      });
      const response = await fetch(`/api/exchange-rate?${params}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Rate unavailable");
      const rate = parseExchangeRateResponse(await response.json());
      const unitPriceCents = convertCents(
        item.unit_price_cents,
        rate.rateMicros,
      );
      dispatch({
        type: "conversion-succeeded",
        request,
        update: {
          ...update,
          unitPrice: formatScaledDecimal(unitPriceCents, 2, false),
        },
        notice: `${item.currency} price converted to ${state.currency} using the ${rate.source} reference rate dated ${rate.date}.`,
      });
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("name" in error) ||
        error.name !== "AbortError"
      ) {
        dispatch({
          type: "conversion-failed",
          request,
          message: `Could not convert ${item.name} from ${item.currency} to ${state.currency}. Try again or enter the price manually.`,
        });
      }
    } finally {
      if (pendingConversion.current?.request.id === request.id) {
        pendingConversion.current = null;
      }
    }
  }

  function addLine() {
    dispatch({
      type: "add",
      line: emptyInvoiceLine(`${idPrefix}-${++nextKey.current}`),
    });
  }

  function removeLine(key: string) {
    cancelConversion(key);
    dispatch({ type: "remove", key });
  }

  function changeCurrency(currency: string) {
    if (currency === state.currency) return;
    cancelConversion();
    dispatch({ type: "currency", currency });
  }

  return {
    ...state,
    addLine,
    changeCurrency,
    estimates,
    removeLine,
    selectItem,
    serialisedLines: serialiseInvoiceLines(state.lines),
    totals,
    updateLine,
  };
}
