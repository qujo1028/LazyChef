import { describe, expect, it } from "vitest"

import { AI_MAX_HINT_LENGTH } from "../_shared/core/ai-contract.ts"
import { cleanHint, parseRequest } from "./validate.ts"

const HOUSEHOLD = "4F7C2A1E-9B3D-4C5E-8F6A-1B2C3D4E5F60"

describe("parseRequest", () => {
  it("takes an allowance request", () => {
    expect(parseRequest({ action: "allowance", householdId: HOUSEHOLD })).toEqual({
      ok: true,
      request: { action: "allowance", householdId: HOUSEHOLD.toLowerCase() },
    })
  })

  it("takes an ideas request with or without a hint", () => {
    expect(parseRequest({ action: "ideas", householdId: HOUSEHOLD, meal: "main course" })).toEqual({
      ok: true,
      request: { action: "ideas", householdId: HOUSEHOLD.toLowerCase(), meal: "main course", hint: "" },
    })
    expect(parseRequest({ action: "ideas", householdId: HOUSEHOLD, meal: "soup", hint: "  quick\n\nand  warm " })).toMatchObject({
      ok: true,
      request: { hint: "quick and warm" },
    })
    expect(parseRequest({ action: "ideas", householdId: HOUSEHOLD, meal: "soup", hint: null })).toMatchObject({ request: { hint: "" } })
  })

  it("refuses anything that doesn't fit", () => {
    const bad = [
      null,
      [],
      "ideas",
      { action: "nope", householdId: HOUSEHOLD },
      { action: "allowance" },
      { action: "allowance", householdId: "not-a-uuid" },
      { action: "ideas", householdId: HOUSEHOLD },
      { action: "ideas", householdId: HOUSEHOLD, meal: "brunch" },
      { action: "ideas", householdId: HOUSEHOLD, meal: "soup", hint: 4 },
      { action: "ideas", householdId: HOUSEHOLD, meal: "soup", hint: "x".repeat(AI_MAX_HINT_LENGTH + 1) },
      { action: "ideas", householdId: HOUSEHOLD, meal: "soup", hint: " ".repeat(501) },
    ]
    for (const body of bad) expect(parseRequest(body).ok, JSON.stringify(body)).toBe(false)
  })

  it("measures the hint after cleaning", () => {
    const padded = `  ${"x".repeat(AI_MAX_HINT_LENGTH)}   `
    expect(parseRequest({ action: "ideas", householdId: HOUSEHOLD, meal: "soup", hint: padded }).ok).toBe(true)
  })
})

describe("cleanHint", () => {
  it("drops control, zero-width and direction characters", () => {
    expect(cleanHint("spicy\u0000\u200b\u202enoodles\u2028now\ufeff")).toBe("spicy noodles now")
  })
})
