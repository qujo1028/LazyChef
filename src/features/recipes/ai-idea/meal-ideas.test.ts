import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  AI_BORDER_CLASS,
  buildMealIdeasMessages,
  ideaMealFor,
  ideasCacheKeySource,
  initialMealIdeasState,
  keepIdeas,
  mealIdeasReplySchema,
  mealPhrase,
  ownInputFromIdea,
  readCachedIdeas,
} from "./meal-ideas"
import { validateOwnRecipe } from "@lazychef/core/recipes/own-recipe"

const idea = (title: string, names: string[] = ["eggs", "spinach"]) => ({
  title,
  description: "Quick.",
  servings: 2,
  minutes: 15,
  ingredients: names.map((name) => ({ name, amount: "1", fromPantry: false })),
  steps: ["1. Cook it."],
})
const veg = { diet: "vegetarian", allergies: [] } as const

describe("keepIdeas", () => {
  it("keeps at most three valid, distinct ideas and cleans step numbers", () => {
    const raw = [idea("A"), idea("a"), { nope: true }, idea("B"), idea("C"), idea("D")]
    const out = keepIdeas(raw, null, ["eggs"])
    expect(out.map((i) => i.title)).toEqual(["A", "B", "C"])
    expect(out[0].steps).toEqual(["Cook it."])
    expect(out[0].ingredients[0].fromPantry).toBe(true)
    expect(out[0].ingredients[1].fromPantry).toBe(false)
  })

  it("drops ideas that break the diet", () => {
    const out = keepIdeas([idea("Chicken bowl", ["chicken breast", "rice"]), idea("Veg bowl", ["rice", "beans"])], veg, [])
    expect(out.map((i) => i.title)).toEqual(["Veg bowl"])
  })
})

describe("readCachedIdeas", () => {
  it("re-validates cached JSON", () => {
    expect(readCachedIdeas({ ideas: [idea("A")] }, null, [])?.length).toBe(1)
    expect(readCachedIdeas({ ideas: [{ title: "" }] }, null, [])).toBeNull()
    expect(readCachedIdeas("junk", null, [])).toBeNull()
    expect(readCachedIdeas({ ideas: [idea("Chicken", ["chicken"])] }, veg, [])).toBeNull()
  })
})

describe("cache key", () => {
  it("ignores pantry order and case, but not meal, diet or contents", () => {
    const base = ideasCacheKeySource("lunch", ["Eggs", "milk"], null)
    expect(ideasCacheKeySource("lunch", ["milk", "eggs", "eggs"], null)).toBe(base)
    expect(ideasCacheKeySource("main course", ["milk", "eggs"], null)).not.toBe(base)
    expect(ideasCacheKeySource("lunch", ["milk", "eggs"], veg)).not.toBe(base)
    expect(ideasCacheKeySource("lunch", ["milk", "eggs", "rice"], null)).not.toBe(base)
  })
})

describe("prompt and parsing", () => {
  it("asks for three ideas and puts the meal and pantry in the user message", () => {
    const [system, user] = buildMealIdeasMessages(["eggs"], "lunch", veg)
    expect(system.content).toContain("exactly 3")
    expect(user.content).toContain("light")
    expect(user.content).toContain('["eggs"]')
    expect(user.content).toContain("Vegetarian")
    expect(buildMealIdeasMessages(["eggs"], "breakfast")[1].content).toContain("breakfast foods")
  })
  it("accepts a reply with an ideas array only", () => {
    expect(mealIdeasReplySchema.safeParse({ ideas: [1, 2, 3] }).success).toBe(true)
    expect(mealIdeasReplySchema.safeParse({ ideas: [] }).success).toBe(false)
  })
  it("labels meals", () => {
    expect(mealPhrase("main course")).toBe("dinner")
    expect(ideaMealFor(["dessert", "snack"])).toBe("dessert")
    expect(ideaMealFor(null)).toBe("any")
  })
})

describe("consent gating", () => {
  it("only fetches on its own with stored consent; otherwise offers", () => {
    expect(initialMealIdeasState(true)).toEqual({ status: "loading" })
    expect(initialMealIdeasState(false)).toEqual({ status: "offer" })
  })
})

describe("save", () => {
  it("turns an idea into a valid own-recipe input", () => {
    const parsed = validateOwnRecipe(ownInputFromIdea(keepIdeas([idea("A")], null, [])[0], "lunch"))
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.mealTypes).toEqual(["lunch"])
      expect(parsed.data.ingredients.length).toBe(2)
    }
  })
})

describe("reduced motion", () => {
  it("static border under prefers-reduced-motion", () => {
    const css = readFileSync(path.join(__dirname, "../../../app/globals.css"), "utf8")
    const block = css.slice(css.indexOf("prefers-reduced-motion: reduce", css.indexOf(`.${AI_BORDER_CLASS}`)))
    expect(block).toMatch(/\.ai-border[\s\S]*animation: none/)
  })
})
