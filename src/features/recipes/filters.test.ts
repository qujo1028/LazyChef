import { describe, expect, it } from "vitest"

import { filtersHref, hasFilters, parseFilters } from "./filters"

describe("recipe filters", () => {
  it("reads known values and ignores the rest", () => {
    expect(parseFilters({ type: "breakfast", time: "30" })).toEqual({ type: "breakfast", maxTime: 30 })
    expect(parseFilters({ type: ["Main Course"], time: "20" })).toEqual({ type: "main course", maxTime: null })
    expect(parseFilters({ type: "brunch" })).toEqual({ type: null, maxTime: null })
  })

  it("builds links without empty filters", () => {
    expect(filtersHref({ type: null, maxTime: null })).toBe("/recipes")
    expect(filtersHref({ type: "main course", maxTime: 45 })).toBe("/recipes?type=main+course&time=45")
    expect(hasFilters({ type: null, maxTime: 15 })).toBe(true)
  })
})
