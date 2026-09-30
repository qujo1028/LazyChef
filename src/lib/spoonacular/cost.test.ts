import { describe, expect, it } from "vitest"

import {
  complexSearchCost,
  findByIngredientsCost,
  informationBulkCost,
  nextQuotaReset,
  parseIngredientsCost,
  recipeInformationCost,
  utcDay,
} from "./cost"

describe("Spoonacular costs", () => {
  it("findByIngredients is 1 + 0.01 per recipe", () => {
    expect(findByIngredientsCost(0)).toBe(1)
    expect(findByIngredientsCost(40)).toBe(1.4)
    expect(findByIngredientsCost(-5)).toBe(1)
  })

  it("complexSearch adds 0.025 per result for each add-on", () => {
    expect(complexSearchCost(20)).toBe(1.2)
    expect(complexSearchCost(20, { fillIngredients: true })).toBe(1.7)
    expect(complexSearchCost(20, { fillIngredients: true, addRecipeInformation: true })).toBe(2.2)
    expect(complexSearchCost(10, { fillIngredients: true, addRecipeInformation: true, addRecipeInstructions: true })).toBe(1.85)
  })

  it("information is 1, informationBulk is 1 + 0.5 per extra recipe", () => {
    expect(recipeInformationCost()).toBe(1)
    expect(informationBulkCost(0)).toBe(0)
    expect(informationBulkCost(1)).toBe(1)
    expect(informationBulkCost(5)).toBe(3)
  })

  it("parseIngredients is 1 per line", () => {
    expect(parseIngredientsCost(3)).toBe(3)
  })

  it("the quota resets at midnight UTC", () => {
    expect(nextQuotaReset(new Date("2026-09-29T23:59:59Z")).toISOString()).toBe("2026-09-30T00:00:00.000Z")
    // 8pm in Denver on the 29th is already the 30th in UTC.
    expect(nextQuotaReset(new Date("2026-09-29T20:00:00-06:00")).toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(utcDay(new Date("2026-09-29T20:00:00-06:00"))).toBe("2026-09-30")
  })
})
