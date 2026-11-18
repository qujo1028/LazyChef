import { describe, expect, it } from "vitest"

import { compareSuggestions, rankLocal, type LocalIngredient, type LocalRecipeCard } from "./local-match"
import { buildPantryIndex, type Suggestion } from "./match"
import { buildMealIdeasMessages, ideasCacheKeySource } from "./ai-idea/meal-ideas"
import { buildIdeaMessages } from "./ai-idea/idea"
import {
  applyTaste,
  buildTasteProfile,
  EMPTY_TASTE,
  hintLines,
  hintsKeySource,
  netScores,
  tasteHints,
  tasteScore,
  type TasteRating,
} from "./taste"

const rate = (ref: string, rating: number, day = 1, user = "u1"): TasteRating & { user_id: string } => ({
  user_id: user,
  recipe_ref: ref,
  rating,
  updated_at: `2026-11-${String(day).padStart(2, "0")}T12:00:00Z`,
})

const known = [
  { id: "liked", cuisine: "Italian", ingredients: ["pasta", "tomato", "basil", "salt"] },
  { id: "disliked", cuisine: "Thai", ingredients: ["tofu", "peanut", "lime"] },
]
const profile = buildTasteProfile([rate("liked", 1), rate("disliked", -1)], known)

describe("tasteScore", () => {
  it("scores rated recipes by their own net votes, up above down", () => {
    expect(tasteScore(profile, { id: "liked", ingredients: [] })).toBeGreaterThan(0)
    expect(tasteScore(profile, { id: "disliked", ingredients: [] })).toBeLessThan(0)
  })

  it("nets votes across members and ignores a tied recipe", () => {
    const p = buildTasteProfile([rate("a", 1, 1, "u1"), rate("a", -1, 2, "u2"), rate("b", 1, 1, "u1"), rate("b", 1, 1, "u2")], [])
    expect(netScores([rate("a", 1), rate("a", -1, 1, "u2")]).size).toBe(0)
    expect(tasteScore(p, { id: "a", ingredients: [] })).toBe(0)
    expect(tasteScore(p, { id: "b", ingredients: [] })).toBe(6)
  })

  it("gives unrated recipes a smaller boost for the same cuisine or 2+ shared main ingredients", () => {
    const direct = tasteScore(profile, { id: "liked", ingredients: [] })
    const sameCuisine = tasteScore(profile, { id: "x", cuisine: "italian", ingredients: ["rice"] })
    const sharedTwo = tasteScore(profile, { id: "y", ingredients: ["Pasta", "tomatoes", "cheese"] })
    expect(sameCuisine).toBeGreaterThan(0)
    expect(sharedTwo).toBeGreaterThan(0)
    expect(sameCuisine).toBeLessThan(direct)
  })

  it("does not count one shared ingredient or shared basics", () => {
    expect(tasteScore(profile, { id: "z", ingredients: ["pasta", "salt", "water", "milk"] })).toBe(0)
  })

  it("gives a smaller penalty to unrated recipes like disliked ones", () => {
    const sim = tasteScore(profile, { id: "t", cuisine: "Thai", ingredients: [] })
    expect(sim).toBeLessThan(0)
    expect(sim).toBeGreaterThan(tasteScore(profile, { id: "disliked", ingredients: [] }))
  })

  it("is 0 with no ratings", () => {
    expect(tasteScore(EMPTY_TASTE, { id: "x", cuisine: "Italian", ingredients: ["pasta"] })).toBe(0)
  })
})

const index = buildPantryIndex(
  ["eggs", "milk", "flour", "tomato"].map((name) => ({ name, quantity: 1, ingredient_id: null, is_staple: false, expires_on: null })),
  "2026-11-17",
)
const line = (name: string): LocalIngredient => ({ original: name, name, quantity: null, unit: null, ingredient_id: null, optional: false })
const card = (id: string, names: string[], extra: Partial<LocalRecipeCard> = {}): LocalRecipeCard => ({
  id,
  source: "themealdb",
  title: `Recipe ${id}`,
  image: null,
  readyInMinutes: null,
  ingredients: names.map(line),
  ...extra,
})

describe("rankLocal with taste", () => {
  const cards = [card("a", ["eggs", "milk"]), card("b", ["eggs", "flour"]), card("c", ["eggs", "tomato"])]

  it("is unchanged without ratings", () => {
    expect(rankLocal(index, cards).makeNow.map((s) => s.id)).toEqual(["a", "b", "c"])
  })

  it("ranks thumbs-up higher and thumbs-down lower, still shown", () => {
    const taste = buildTasteProfile([rate("c", 1), rate("a", -1)], [])
    expect(rankLocal(index, cards, taste).makeNow.map((s) => s.id)).toEqual(["c", "b", "a"])
  })

  it("only breaks ties: a liked recipe with more missing stays behind", () => {
    const withMissing = [card("liked-more", ["eggs", "saffron"]), card("plain", ["eggs", "milk"])]
    const taste = buildTasteProfile([rate("liked-more", 1)], [])
    const out = rankLocal(index, withMissing, taste)
    expect(out.makeNow.map((s) => s.id)).toEqual(["plain"])
    expect(out.almostThere.map((s) => s.id)).toEqual(["liked-more"])
  })

  it("boosts unrated recipes similar to a liked one", () => {
    const taste = buildTasteProfile([rate("fav", 1)], [{ id: "fav", cuisine: "French", ingredients: ["eggs", "flour"] }])
    const out = rankLocal(index, [card("a", ["eggs", "milk"]), card("b", ["eggs", "flour", "milk"])], taste)
    expect(out.makeNow[0].id).toBe("b")
  })
})

describe("compareSuggestions and applyTaste", () => {
  const s = (id: string, need: string[]): Suggestion => ({ id, source: "spoonacular", title: id, image: null, readyInMinutes: null, have: ["x"], need, usesExpiring: [] })

  it("taste never beats the missing count", () => {
    const scores = new Map([["many", 6]])
    expect(compareSuggestions(s("many", ["a", "b"]), s("few", ["a"]), scores)).toBeGreaterThan(0)
    expect(applyTaste([s("many", ["a", "b"]), s("few", ["a"])], scores).map((x) => x.id)).toEqual(["few", "many"])
  })

  it("applyTaste keeps the existing order for equal scores and drops nothing", () => {
    const list = [s("a", []), s("b", []), s("c", [])]
    expect(applyTaste(list, new Map([["c", 3], ["a", -3]])).map((x) => x.id)).toEqual(["c", "b", "a"])
    expect(applyTaste(list, new Map()).map((x) => x.id)).toEqual(["a", "b", "c"])
  })
})

describe("hints and prompts", () => {
  const ratings = [rate("1", 1, 5), rate("2", 1, 9), rate("3", -1, 3), rate("local", 1, 2), rate("4", -1, 1, "u1"), rate("4", 1, 2, "u2")]
  const titles = new Map([["1", "Soup"], ["2", "Curry"], ["3", "Liver"], ["local", "Pancakes"]])

  it("lists up to 5 liked and disliked titles, most recent first, skipping untitled", () => {
    const hints = tasteHints(ratings, titles)
    expect(hints.liked).toEqual(["Curry", "Soup", "Pancakes"])
    expect(hints.disliked).toEqual(["Liver"])
    const many = Array.from({ length: 9 }, (_, i) => rate(`r${i}`, 1, i + 1))
    const manyTitles = new Map(many.map((r) => [r.recipe_ref, `Dish ${r.recipe_ref}`]))
    expect(tasteHints(many, manyTitles).liked).toHaveLength(5)
    expect(tasteHints(many, manyTitles).liked[0]).toBe("Dish r8")
  })

  const hints = { liked: ["Curry"], disliked: ["Liver"] }

  it("puts hints in the user message only (meal ideas)", () => {
    const [system, user] = buildMealIdeasMessages(["eggs"], "any", null, hints)
    expect(user.content).toContain('Liked: ["Curry"]')
    expect(user.content).toContain('Disliked: ["Liver"]')
    expect(user.content).toMatch(/lean toward/i)
    expect(system.content).not.toMatch(/Curry|Liver|Liked/)
  })

  it("puts hints in the user message only (Stuck for ideas)", () => {
    const [system, user] = buildIdeaMessages(["eggs"], "quick", undefined, null, hints)
    expect(user.content).toContain('Liked: ["Curry"]')
    expect(system.content).not.toMatch(/Curry|Liver|Liked/)
  })

  it("adds nothing without hints", () => {
    expect(hintLines({ liked: [], disliked: [] })).toEqual([])
    expect(buildIdeaMessages(["eggs"], "")[1].content).not.toContain("Liked")
  })

  it("changes the cache key when the hints change, not when they don't", () => {
    const base = ideasCacheKeySource("any", ["eggs"], null)
    expect(ideasCacheKeySource("any", ["eggs"], null, { liked: [], disliked: [] })).toBe(base)
    const withHints = ideasCacheKeySource("any", ["eggs"], null, hints)
    expect(withHints).not.toBe(base)
    expect(ideasCacheKeySource("any", ["eggs"], null, { liked: ["Curry"], disliked: ["Liver"] })).toBe(withHints)
    expect(ideasCacheKeySource("any", ["eggs"], null, { liked: ["Curry", "Soup"], disliked: ["Liver"] })).not.toBe(withHints)
    expect(hintsKeySource({ liked: [], disliked: [] })).toBe("")
  })
})
