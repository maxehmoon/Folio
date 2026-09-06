import { describe, expect, it } from "vitest"

import { formatHundredthsForInput, formatTaxRate } from "./presentation"

describe("item presentation", () => {
  it("formats integer hundredths without losing trailing zeroes", () => {
    expect(formatHundredthsForInput(125_050)).toBe("1250.50")
    expect(formatHundredthsForInput(2_025)).toBe("20.25")
  })

  it("formats basis points as a percentage", () => {
    expect(formatTaxRate(2_000)).toBe("20%")
    expect(formatTaxRate(1_755)).toBe("17.55%")
  })
})
