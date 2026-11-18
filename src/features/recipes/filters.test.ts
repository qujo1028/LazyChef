import { describe, expect, it } from "vitest"

import {
  autoLabel,
  autoSlot,
  CLEAR_FILTERS,
  filterRecipes,
  filtersHref,
  hasFilters,
  hourInZone,
  matchesMeal,
  matchesTime,
  parseFilters,
  resolveMeals,
} from "./filters"

const recipe = (dishTypes: string[], readyInMinutes: number | null = 25) => ({ dishTypes, readyInMinutes })

describe("recipe filters", () => {
  it("defaults to auto, reads known values and ignores the rest", () => {
    expect(parseFilters({})).toEqual({ type: "auto", maxTime: null })
    expect(parseFilters({ type: "breakfast", time: "30" })).toEqual({ type: "breakfast", maxTime: 30 })
    expect(parseFilters({ type: ["Main Course"], time: "20" })).toEqual({ type: "main course", maxTime: null })
    expect(parseFilters({ type: "lunch" })).toEqual({ type: "lunch", maxTime: null })
    expect(parseFilters({ type: "any" })).toEqual({ type: "any", maxTime: null })
    expect(parseFilters({ type: "brunch" })).toEqual({ type: "auto", maxTime: null })
  })

  it("builds links without the default or empty filters", () => {
    expect(filtersHref({ type: "auto", maxTime: null })).toBe("/recipes")
    expect(filtersHref(CLEAR_FILTERS)).toBe("/recipes?type=any")
    expect(filtersHref({ type: "main course", maxTime: 45 })).toBe("/recipes?type=main+course&time=45")
    expect(filtersHref({ type: "auto", maxTime: 15 })).toBe("/recipes?time=15")
  })

  it("counts only a person's own choices as filters", () => {
    expect(hasFilters({ type: "auto", maxTime: null })).toBe(false)
    expect(hasFilters({ type: "auto", maxTime: 15 })).toBe(true)
    expect(hasFilters(CLEAR_FILTERS)).toBe(true)
  })
})

describe("auto meal", () => {
  it.each([
    [5, "Dessert"],
    [6, "Breakfast"],
    [10, "Breakfast"],
    [11, "Lunch"],
    [14, "Lunch"],
    [15, "Snack"],
    [16, "Snack"],
    [17, "Dinner"],
    [20, "Dinner"],
    [21, "Dessert"],
    [23, "Dessert"],
    [0, "Dessert"],
  ])("hour %i is %s", (hour, label) => {
    expect(autoSlot(hour).label).toBe(label)
    expect(autoLabel(hour)).toBe(label)
  })

  it("shows dessert and snacks late at night", () => {
    expect(autoSlot(22).meals).toEqual(["dessert", "snack"])
  })

  it("resolves the choice to meals", () => {
    expect(resolveMeals("any", 8)).toBeNull()
    expect(resolveMeals("auto", null)).toBeNull()
    expect(resolveMeals("auto", 8)).toEqual(["breakfast"])
    expect(resolveMeals("auto", 18)).toEqual(["main course"])
    expect(resolveMeals("soup", 8)).toEqual(["soup"])
    expect(autoLabel(null)).toBeNull()
  })

  it("reads the hour in the viewer's time zone", () => {
    const noonUtc = new Date("2026-11-17T12:00:00Z")
    expect(hourInZone(noonUtc, "UTC")).toBe(12)
    expect(hourInZone(noonUtc, "America/Denver")).toBe(5) // MST, UTC-7
    expect(hourInZone(noonUtc, "Asia/Tokyo")).toBe(21)
    expect(hourInZone(new Date("2026-11-17T00:30:00Z"), "UTC")).toBe(0)
    expect(hourInZone(noonUtc, undefined)).toBeNull()
    expect(hourInZone(noonUtc, "Not/AZone")).toBeNull()
  })
})

describe("local filtering", () => {
  it("matches breakfast, dinner and the single-type meals by dishTypes", () => {
    expect(matchesMeal(recipe(["morning meal"]), "breakfast")).toBe(true)
    expect(matchesMeal(recipe(["main course", "dinner"]), "main course")).toBe(true)
    expect(matchesMeal(recipe(["side dish"]), "main course")).toBe(false)
    expect(matchesMeal(recipe(["fingerfood"]), "snack")).toBe(true)
    expect(matchesMeal(recipe([]), "breakfast")).toBe(false)
  })

  it("keeps lunch light: salads, soups, labelled lunch, or a quick main course", () => {
    expect(matchesMeal(recipe(["salad"], 45), "lunch")).toBe(true)
    expect(matchesMeal(recipe(["soup"], 90), "lunch")).toBe(true)
    expect(matchesMeal(recipe(["lunch"], 60), "lunch")).toBe(true)
    expect(matchesMeal(recipe(["main course"], 30), "lunch")).toBe(true)
    expect(matchesMeal(recipe(["main course"], 31), "lunch")).toBe(false)
    expect(matchesMeal(recipe(["main course"], null), "lunch")).toBe(false)
    expect(matchesMeal(recipe(["dessert"], 10), "lunch")).toBe(false)
  })

  it("applies cook time, treating unknown time as too long", () => {
    expect(matchesTime(recipe([], 30), 30)).toBe(true)
    expect(matchesTime(recipe([], 31), 30)).toBe(false)
    expect(matchesTime(recipe([], null), 30)).toBe(false)
    expect(matchesTime(recipe([], null), null)).toBe(true)
  })

  it("filters a pool by meals and time", () => {
    const pool = [recipe(["soup"], 20), recipe(["main course"], 50), recipe(["dessert"], 15), recipe(["salad"], 10)]
    expect(filterRecipes(pool, null, null)).toHaveLength(4)
    expect(filterRecipes(pool, ["lunch"], null)).toHaveLength(2)
    expect(filterRecipes(pool, ["lunch"], 15)).toEqual([pool[3]])
    expect(filterRecipes(pool, ["dessert", "snack"], null)).toEqual([pool[2]])
  })
})
