import { describe, expect, it } from "vitest"

import { filtersHref, hasFilters, parseFilters, parseMore } from "./filters"

describe("recipe filters", () => {
  it("reads known values and ignores the rest", () => {
    expect(parseFilters({ type: "breakfast", time: "30" })).toEqual({ type: "breakfast", maxTime: 30, query: null, world: false })
    expect(parseFilters({ type: ["Main Course"], time: "20" })).toEqual({ type: "main course", maxTime: null, query: null, world: false })
    expect(parseFilters({ type: "brunch" })).toEqual({ type: null, maxTime: null, query: null, world: false })
  })

  it("builds links without empty filters", () => {
    expect(filtersHref({ type: null, maxTime: null, query: null, world: false })).toBe("/recipes")
    expect(filtersHref({ type: "main course", maxTime: 45, query: null, world: false })).toBe("/recipes?type=main+course&time=45")
    expect(filtersHref({ type: null, maxTime: null, query: "chicken curry", world: false }, { more: true })).toBe("/recipes?q=chicken+curry&more=1")
    expect(hasFilters({ type: null, maxTime: 15, query: null, world: false })).toBe(true)
    expect(hasFilters({ type: null, maxTime: null, query: "soup", world: false })).toBe(true)
  })

  it("reads and writes the world recipes switch", () => {
    expect(parseFilters({ world: "1" }).world).toBe(true)
    expect(parseFilters({ world: "yes" }).world).toBe(false)
    expect(filtersHref({ type: null, maxTime: null, query: null, world: true })).toBe("/recipes?world=1")
    expect(hasFilters({ type: null, maxTime: null, query: null, world: true })).toBe(false)
  })

  it("cleans up searches", () => {
    expect(parseFilters({ q: "  chicken   curry " }).query).toBe("chicken curry")
    expect(parseFilters({ q: "   " }).query).toBeNull()
    expect(parseFilters({ q: "x".repeat(200) }).query).toHaveLength(80)
  })

  it("reads Show more ideas", () => {
    expect(parseMore({ more: "1" })).toBe(true)
    expect(parseMore({ more: "yes" })).toBe(false)
    expect(parseMore({})).toBe(false)
  })
})
