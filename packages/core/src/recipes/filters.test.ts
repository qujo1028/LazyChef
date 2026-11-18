import { describe, expect, it } from "vitest"

import {
  autoLabel,
  autoSlot,
  filtersHref,
  hasFilters,
  hourInZone,
  isAuto,
  mealQueries,
  parseFilters,
  parseMore,
  resolveMeals,
} from "./filters"
import { mergeRecipeIds } from "./local-match"

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

  it("falls back to the person's world recipes default, and links say only what differs", () => {
    const on = parseFilters({}, { worldDefault: true })
    expect(on.world).toBe(true)
    expect(filtersHref(on)).toBe("/recipes")
    expect(filtersHref({ ...on, world: false })).toBe("/recipes?world=0")
    expect(parseFilters({ world: "0" }, { worldDefault: true }).world).toBe(false)
  })

  it("reads and keeps Show all recipes", () => {
    const all = parseFilters({ all: "1", q: "soup" })
    expect(all.all).toBe(true)
    expect(filtersHref(all)).toBe("/recipes?q=soup&all=1")
    expect(parseFilters({ all: "yes" }).all).toBeUndefined()
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

describe("auto meal", () => {
  it("maps every local hour to a slot, wrapping overnight", () => {
    const label = (h: number) => autoSlot(h).label
    expect([6, 10].map(label)).toEqual(["Breakfast", "Breakfast"])
    expect([11, 14].map(label)).toEqual(["Lunch", "Lunch"])
    expect([15, 16].map(label)).toEqual(["Snack", "Snack"])
    expect([17, 20].map(label)).toEqual(["Dinner", "Dinner"])
    expect([21, 23, 0, 3, 5].map(label)).toEqual(Array(5).fill("Dessert"))
    expect(autoSlot(2).meals).toEqual(["dessert", "snack"])
    expect(autoSlot(12).meals).toEqual(["lunch"])
    expect(autoSlot(18).meals).toEqual(["main course"])
  })

  it("reads the URL: no type is Auto, type=any is Any meal, a meal is manual", () => {
    expect(isAuto(parseFilters({}))).toBe(true)
    expect(parseFilters({ type: "any" })).toMatchObject({ type: null, anyMeal: true })
    expect(parseFilters({ type: "lunch" })).toMatchObject({ type: "lunch" })
    expect(isAuto(parseFilters({ type: "any" }))).toBe(false)
    expect(isAuto(parseFilters({ type: "lunch" }))).toBe(false)
  })

  it("does not count Auto (or Any meal) as a filter, and omits the default from links", () => {
    expect(hasFilters(parseFilters({}))).toBe(false)
    expect(hasFilters(parseFilters({ type: "any" }))).toBe(false)
    expect(hasFilters(parseFilters({ type: "lunch" }))).toBe(true)
    expect(filtersHref(parseFilters({}))).toBe("/recipes")
    expect(filtersHref(parseFilters({ type: "any" }))).toBe("/recipes?type=any")
    expect(filtersHref(parseFilters({ type: "lunch", time: "15" }))).toBe("/recipes?type=lunch&time=15")
  })

  it("resolves the meals: manual wins, Any is everything, Auto needs a known hour", () => {
    expect(resolveMeals({ type: "soup" }, 8)).toEqual(["soup"])
    expect(resolveMeals({ type: null, anyMeal: true }, 8)).toBeNull()
    expect(resolveMeals({ type: null }, null)).toBeNull()
    expect(resolveMeals({ type: null }, 8)).toEqual(["breakfast"])
    expect(autoLabel(18)).toBe("Dinner")
    expect(autoLabel(null)).toBeNull()
  })

  it("finds the viewer's local hour from an IANA zone", () => {
    const noonUtc = new Date("2026-11-17T12:00:00Z")
    expect(hourInZone(noonUtc, "UTC")).toBe(12)
    expect(hourInZone(noonUtc, "America/Denver")).toBe(5) // MST, UTC-7
    expect(hourInZone(noonUtc, "Asia/Tokyo")).toBe(21)
    expect(hourInZone(new Date("2026-11-17T00:30:00Z"), "UTC")).toBe(0)
    expect(hourInZone(noonUtc, undefined)).toBeNull()
    expect(hourInZone(noonUtc, "Not/AZone")).toBeNull()
  })

  it("expands lunch into salad, soup and a quick main course", () => {
    expect(mealQueries(null, 15)).toBeNull()
    expect(mealQueries(["lunch"], null)).toEqual([
      { type: "main course", maxMinutes: 30 },
      { type: "salad", maxMinutes: null },
      { type: "soup", maxMinutes: null },
    ])
    expect(mealQueries(["lunch"], 15)?.[0]).toEqual({ type: "main course", maxMinutes: 15 })
    expect(mealQueries(["lunch"], 60)?.[0]).toEqual({ type: "main course", maxMinutes: 30 })
    expect(mealQueries(["dessert", "snack"], 45)).toEqual([
      { type: "dessert", maxMinutes: 45 },
      { type: "snack", maxMinutes: 45 },
    ])
  })

  it("merges per-type library results without repeats, best first", () => {
    const list = (...ids: string[]) => ids.map((recipe_id) => ({ recipe_id }))
    expect(mergeRecipeIds([list("a", "b", "c"), list("b", "d"), []])).toEqual(["a", "b", "d", "c"])
    expect(mergeRecipeIds([])).toEqual([])
  })
})
