import { describe, expect, it } from "vitest";

import {
  invoiceLineEditorReducer,
  parseExchangeRateResponse,
  serialiseInvoiceLines,
  type InvoiceLineEditorState,
} from "./line-editor-model";
import { parseSubmittedInvoiceLines } from "./line-input";

const line = {
  key: "line-1",
  itemId: null,
  description: "Design retainer",
  unit: "month",
  quantity: "1.25",
  unitPrice: "120.00",
  taxRate: "20",
};

function editorState(): InvoiceLineEditorState {
  return {
    lines: [line],
    currency: "GBP",
    conversion: null,
    exchangeNotice: null,
    exchangeError: null,
  };
}

describe("invoice line model", () => {
  it("uses one parser contract for invoice and recurring submissions", () => {
    const submitted = serialiseInvoiceLines([line]);

    expect(parseSubmittedInvoiceLines(submitted, "invoice")).toEqual(
      parseSubmittedInvoiceLines(submitted, "recurring invoice"),
    );
    expect(parseSubmittedInvoiceLines(submitted)).toEqual([
      {
        itemId: null,
        description: "Design retainer",
        unit: "month",
        quantityThousandths: 1_250,
        unitPriceCents: 12_000,
        taxRateBps: 2_000,
      },
    ]);
  });

  it("ignores a conversion response after the currency changes", () => {
    const request = { id: 1, lineKey: "line-1", currency: "GBP" };
    const started = invoiceLineEditorReducer(editorState(), {
      type: "conversion-started",
      request,
    });
    const changedCurrency = invoiceLineEditorReducer(started, {
      type: "currency",
      currency: "EUR",
    });
    const staleResult = invoiceLineEditorReducer(changedCurrency, {
      type: "conversion-succeeded",
      request,
      update: { itemId: "item-1", unitPrice: "99.00" },
      notice: "Converted",
    });

    expect(staleResult).toBe(changedCurrency);
    expect(staleResult.lines[0]).toMatchObject({
      itemId: null,
      unitPrice: "120.00",
    });
  });

  it("ignores an older response when a newer item conversion has started", () => {
    const first = { id: 1, lineKey: "line-1", currency: "GBP" };
    const second = { id: 2, lineKey: "line-1", currency: "GBP" };
    const state = invoiceLineEditorReducer(
      invoiceLineEditorReducer(editorState(), {
        type: "conversion-started",
        request: first,
      }),
      { type: "conversion-started", request: second },
    );

    expect(
      invoiceLineEditorReducer(state, {
        type: "conversion-succeeded",
        request: first,
        update: { itemId: "old-item", unitPrice: "1.00" },
        notice: "Old conversion",
      }),
    ).toBe(state);
  });

  it("validates exchange-rate responses before they reach editor state", () => {
    expect(
      parseExchangeRateResponse({
        date: "2026-08-14",
        rateMicros: 1_250_000,
        source: "ECB",
      }),
    ).toEqual({
      date: "2026-08-14",
      rateMicros: 1_250_000,
      source: "ECB",
    });
    expect(() =>
      parseExchangeRateResponse({
        date: "14/08/2026",
        rateMicros: "1250000",
        source: "",
      }),
    ).toThrow("Invalid exchange-rate response");
  });
});
