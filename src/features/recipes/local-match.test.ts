import { describe, expect, it } from "vitest"

import { findIngredient } from "@/lib/ingredients/catalog"

import {
  basicKeys,
  LOCAL_ENOUGH,
  localSuggestion,
  mergeLists,
  mergeSuggestions,
  pantryMatchKeys,
  rankLocal,
  rankSearch,
  titleKey,
  toRecipeIngredients,
  wantsSpoonacular,
  widenKey,
  type LocalIngredient,
  type LocalRecipeCard,
} from "./local-match"
import { buildPantryIndex, type Suggestion } from "./match"

const TODAY = "2026-09-30"

type Row = { name: string; quantity: number | null; ingredient_id: number | null; is_staple: boolean; expires_on: string | null }

function item(name: string, extra: Partial<Row> = {}): Row {
  return { name, quantity: 1, ingredient_id: null, is_staple: false, expires_on: null, ...extra }
}

function line(name: string, extra: Partial<LocalIngredient> = {}): LocalIngredient {
  return { original: name, name, quantity: null, unit: null, ingredient_id: null, optional: false, ...extra }
}

function local(id: string, ingredients: LocalIngredient[], extra: Partial<LocalRecipeCard> = {}): LocalRecipeCard {
  return { id, source: "themealdb", title: `Recipe ${id}`, image: null, readyInMinutes: null, ingredients, ...extra }
}

function suggestion(id: string, title: string, need: string[] = [], source: Suggestion["source"] = "spoonacular"): Suggestion {
  return { id, source, title, image: null, readyInMinutes: null, have: ["x"], need, usesExpiring: [] }
}

describe("keys for the database's first pass", () => {
  it("widens a name to the shorter names it covers, always keeping the last word", () => {
    expect(widenKey("brown rice").sort()).toEqual(["brown rice", "rice"])
    expect(widenKey("smoked sweet paprika").sort()).toEqual(["paprika", "smoked paprika", "smoked sweet paprika", "sweet paprika"])
    expect(widenKey("")).toEqual([])
  })

  it("sends ids and keys for what's available, including the library's name and id", () => {
    const eggs = findIngredient("eggs")!
    const keys = pantryMatchKeys([
      item("Large Eggs"),
      item("brown rice", { ingredient_id: 20040 }),
      item("butter", { quantity: 0 }),
      item("salt", { is_staple: true, quantity: null }),
    ])
    expect(keys.ids).toContain(eggs.id)
    expect(keys.ids).toContain(20040)
    expect(keys.keys).toEqual(expect.arrayContaining(["egg", "rice", "brown rice", "salt"]))
    expect(keys.keys).not.toContain("butter")
  })

  it("lists water, salt and pepper to ignore, but never bell pepper", () => {
    const basics = basicKeys()
    expect(basics.keys).toEqual(expect.arrayContaining(["water", "salt", "black pepper"]))
    expect(basics.keys).not.toContain("bell pepper")
    const bell = findIngredient("bell pepper")
    if (bell?.id != null) expect(basics.ids).not.toContain(bell.id)
  })
})

describe("matching local recipes", () => {
  const index = buildPantryIndex(
    [
      item("eggs"),
      item("cheddar"),
      item("brown rice"),
      item("spinach", { expires_on: "2026-10-01" }),
      item("olive oil", { is_staple: true, quantity: null }),
      item("milk", { quantity: 0 }),
    ],
    TODAY,
  )

  it("counts have and need the same way as Spoonacular results", () => {
    const s = localSuggestion(
      index,
      local("a", [line("eggs"), line("cheddar cheese"), line("rice"), line("milk"), line("salt"), line("water"), line("black pepper")]),
    )
    expect(s.have).toEqual(["eggs", "cheddar cheese", "rice"])
    expect(s.need).toEqual(["milk"])
    expect(s.source).toBe("themealdb")
  })

  it("matches by library id first", () => {
    const eggs = findIngredient("eggs")!
    const s = localSuggestion(index, local("a", [line("free-range hen's eggs, beaten", { ingredient_id: eggs.id })]))
    expect(s.have).toHaveLength(1)
  })

  it("ignores optional lines, and staples count as available", () => {
    const s = localSuggestion(index, local("a", [line("eggs"), line("olive oil"), line("raspberries", { optional: true })]))
    expect(s.need).toEqual([])
    expect(s.have).toEqual(["eggs", "olive oil"])
  })

  it("notes expiring food it would use", () => {
    expect(localSuggestion(index, local("a", [line("spinach")])).usesExpiring).toEqual(["spinach"])
  })

  it("splits into Make now and Almost there: fewest missing, then most pantry items used", () => {
    const { makeNow, almostThere } = rankLocal(index, [
      local("one-missing", [line("eggs"), line("flour")]),
      local("ready-small", [line("eggs")]),
      local("ready-big", [line("eggs"), line("cheddar"), line("rice")]),
      local("one-missing-big", [line("eggs"), line("cheddar"), line("flour")]),
      local("three-missing", [line("eggs"), line("flour"), line("sugar"), line("butter")]),
      local("four-missing", [line("eggs"), line("flour"), line("sugar"), line("butter"), line("vanilla")]),
      local("nothing-from-pantry", [line("flour")]),
    ])
    expect(makeNow.map((s) => s.id)).toEqual(["ready-big", "ready-small"])
    expect(almostThere.map((s) => s.id)).toEqual(["one-missing-big", "one-missing", "three-missing"])
  })

  it("search keeps everything, best first", () => {
    const results = rankSearch(index, [local("far", [line("flour"), line("sugar")]), local("near", [line("eggs")])])
    expect(results.map((s) => s.id)).toEqual(["near", "far"])
  })

  it("hands the other recipe code Spoonacular-shaped ingredients", () => {
    expect(toRecipeIngredients([line("garlic", { original: "3 cloves garlic", quantity: 3, unit: "clove", ingredient_id: 11215 })])).toEqual([
      { id: 11215, name: "garlic", original: "3 cloves garlic", amount: 3, unit: "clove", aisle: null },
    ])
    expect(toRecipeIngredients([line("eggs", { quantity: 2, unit: "count" })])[0].unit).toBe("")
  })
})

describe("combining with Spoonacular", () => {
  it("asks Spoonacular only when local results are thin or for more ideas", () => {
    expect(wantsSpoonacular(LOCAL_ENOUGH - 1, false)).toBe(true)
    expect(wantsSpoonacular(LOCAL_ENOUGH, false)).toBe(false)
    expect(wantsSpoonacular(40, true)).toBe(true)
  })

  it("treats titles that differ only in case, punctuation and filler words as the same dish", () => {
    expect(titleKey("Spicy Arrabiata Penne!")).toBe(titleKey("spicy arrabiata penne"))
    expect(titleKey("The Best Easy Pancakes Recipe")).toBe(titleKey("Pancakes"))
    expect(titleKey("Crème Brûlée")).toBe("creme brulee")
    expect(titleKey("Mac & Cheese")).toBe(titleKey("Mac and cheese"))
  })

  it("keeps local results first and drops Spoonacular's copies of the same dish", () => {
    const merged = mergeSuggestions(
      {
        makeNow: [suggestion("u1", "Grandma's Pancakes", [], "user")],
        almostThere: [suggestion("m1", "Shakshuka", ["feta"], "themealdb")],
      },
      {
        makeNow: [suggestion("1", "shakshuka"), suggestion("2", "Fried Rice"), suggestion("3", "Grandma’s Pancakes")],
        almostThere: [suggestion("4", "Fried rice"), suggestion("5", "Omelette", ["milk"])],
      },
    )
    // "Grandma’s Pancakes" (curly quote) is the same dish as the household's.
    expect(merged.makeNow.map((s) => s.id)).toEqual(["u1", "2"])
    expect(merged.almostThere.map((s) => s.id)).toEqual(["m1", "5"])
  })

  it("keeps the local results when Spoonacular wasn't asked", () => {
    const local = { makeNow: [suggestion("a", "A", [], "user")], almostThere: [] }
    expect(mergeSuggestions(local, null)).toBe(local)
  })

  it("merges search lists without repeats", () => {
    const merged = mergeLists(
      [suggestion("m1", "Beef Wellington", [], "themealdb")],
      [suggestion("9", "Beef wellington"), suggestion("10", "Other"), suggestion("10", "Other again")],
    )
    expect(merged.map((s) => s.id)).toEqual(["m1", "10"])
  })
})
