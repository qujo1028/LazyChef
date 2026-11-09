import { describe, expect, it } from "vitest"

import type { LocalRecipeCard } from "./local-match"
import type { Suggestion } from "./match"
import { likesCuisine, localFits, preferCuisines } from "./prefs"

const line = (name: string, optional = false) => ({ original: name, name, quantity: null, unit: null, ingredient_id: null, optional })
const card = (lines: ReturnType<typeof line>[]): LocalRecipeCard => ({
  id: "r",
  source: "themealdb",
  title: "R",
  image: null,
  readyInMinutes: null,
  ingredients: lines,
})
const idea = (id: string, need: number): Suggestion => ({
  id,
  source: "themealdb",
  title: id,
  image: null,
  readyInMinutes: null,
  have: [],
  need: Array.from({ length: need }, (_, i) => `x${i}`),
  usesExpiring: [],
})

describe("recipe preferences", () => {
  it("hides recipes whose required lines break the diet, not optional ones", () => {
    const vegetarian = { diet: "vegetarian", allergies: [] } as const
    expect(localFits(card([line("rice"), line("chicken thighs")]), vegetarian)).toBe(false)
    expect(localFits(card([line("rice"), line("bacon bits", true)]), vegetarian)).toBe(true)
    expect(localFits(card([line("chicken")]), null)).toBe(true)
  })

  it("matches the library's cuisine spellings", () => {
    expect(likesCuisine("Italy", ["italian"])).toBe(true)
    expect(likesCuisine("Italian", ["italian"])).toBe(true)
    expect(likesCuisine("Jamaican", ["italian"])).toBe(false)
    expect(likesCuisine(null, ["italian"])).toBe(false)
  })

  it("puts liked cuisines first only among equally close ideas", () => {
    const list = [idea("a", 0), idea("b", 0), idea("c", 1), idea("d", 1)]
    expect(preferCuisines(list, new Set(["b", "d"])).map((s) => s.id)).toEqual(["b", "a", "d", "c"])
    expect(preferCuisines(list, new Set(["c"])).map((s) => s.id)).toEqual(["a", "b", "c", "d"])
  })
})
