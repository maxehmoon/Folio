import type { FinancialEntry } from "@/features/finance/ledger";

const ENTRY_LABELS = {
  expense: "Expense",
  receipt: "Receipt",
  sale: "Sale",
} as const;

function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function renderFinancialEntriesCsv(
  entries: readonly FinancialEntry[],
  baseCurrency: string,
): string {
  const rows = entries
    .map((entry) => {
      const sign = entry.kind === "expense" ? -1 : 1;
      return [
        ENTRY_LABELS[entry.kind],
        entry.date,
        entry.reference,
        entry.party,
        entry.description,
        (sign * entry.amountCents / 100).toFixed(2),
        entry.currency,
        entry.baseConversion.status === "converted"
          ? (sign * entry.baseConversion.amountCents / 100).toFixed(2)
          : "",
        baseCurrency,
        entry.rateDate,
        entry.rateSource,
      ];
    })
    .sort((left, right) => left[1]!.localeCompare(right[1]!));

  const csv = [
    [
      "Type",
      "Date",
      "Reference",
      "Customer or vendor",
      "Description",
      "Amount",
      "Currency",
      "Base amount",
      "Base currency",
      "Rate date",
      "Rate source",
    ],
    ...rows,
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  return `\uFEFF${csv}\r\n`;
}
