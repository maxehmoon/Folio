import { describe, expect, it } from "vitest"

import {
  itemFormSchema,
  parseItemListSearch,
  readItemFormValues,
} from "./schema"

describe("item form validation", () => {
  it("parses prices into integer cents and percentages into basis points", () => {
    const result = itemFormSchema.parse({
      currency: " gbp ",
      description: " Monthly support ",
      name: " Retainer ",
      taxRate: "20.25",
      unit: " month ",
      unitPrice: "1250.5",
    })

    expect(result).toEqual({
      currency: "GBP",
      description: "Monthly support",
      name: "Retainer",
      taxRate: 2_025,
      unit: "month",
      unitPrice: 125_050,
    })
  })

  it("rejects fractional cents and tax rates above 100 per cent", () => {
    const result = itemFormSchema.safeParse({
      currency: "GBP",
      description: "",
      name: "Retainer",
      taxRate: "100.01",
      unit: "month",
      unitPrice: "12.345",
    })

    expect(result.success).toBe(false)
    if (result.success) return

    expect(result.error.flatten().fieldErrors.taxRate).toBeDefined()
    expect(result.error.flatten().fieldErrors.unitPrice).toBeDefined()
  })

  it("keeps prices within the portable database integer range", () => {
    const result = itemFormSchema.safeParse({
      currency: "GBP",
      description: "",
      name: "Retainer",
      taxRate: "20",
      unit: "month",
      unitPrice: "21474836.48",
    })

    expect(result.success).toBe(false)
    if (result.success) return

    expect(result.error.flatten().fieldErrors.unitPrice).toBeDefined()
  })

  it("accepts the largest portable database amount without losing precision", () => {
    const result = itemFormSchema.parse({
      currency: "GBP",
      description: "",
      name: "Retainer",
      taxRate: "100",
      unit: "month",
      unitPrice: "21474836.47",
    })

    expect(result.taxRate).toBe(10_000)
    expect(result.unitPrice).toBe(2_147_483_647)
  })

  it("reads text entries and ignores non-text form values", () => {
    const formData = new FormData()
    formData.set("name", "Consulting")
    formData.set("description", new File([], "description.txt"))

    expect(readItemFormValues(formData)).toMatchObject({
      description: "",
      name: "Consulting",
    })
  })
})

describe("item list query validation", () => {
  it("normalises filters and caps unsupported pagination input", () => {
    expect(
      parseItemListSearch({
        currency: " eur ",
        limit: "999",
        page: "-2",
        q: " design ",
        status: "archived",
      }),
    ).toEqual({
      currency: "EUR",
      limit: 25,
      page: 1,
      q: "design",
      status: "archived",
    })
  })

  it("treats the all-currencies control value as no currency filter", () => {
    expect(parseItemListSearch({ currency: "all" }).currency).toBeUndefined()
  })
})
