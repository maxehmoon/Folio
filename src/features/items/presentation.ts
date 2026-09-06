import type { Item } from "@/lib/db/types"

import type { ItemFormValues } from "./schema"

const taxRateFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
})

export function formatTaxRate(taxRateBps: number): string {
  return `${taxRateFormatter.format(taxRateBps / 100)}%`
}

export function formatHundredthsForInput(value: number): string {
  const whole = Math.floor(value / 100)
  const fraction = String(value % 100).padStart(2, "0")
  return `${whole}.${fraction}`
}

export function itemFormValues(item: Item): ItemFormValues {
  return {
    currency: item.currency,
    description: item.description ?? "",
    name: item.name,
    taxRate: formatHundredthsForInput(item.tax_rate_bps),
    unit: item.unit,
    unitPrice: formatHundredthsForInput(item.unit_price_cents),
  }
}
