import { describe, expect, it } from "vitest"

import type { RecipeIngredient, RecipeSummary } from "@/lib/spoonacular/recipe-shapes"

import {
  buildPantryIndex,
  checkIngredients,
  findInPantry,
  MAX_QUERY_NAMES,
  pantrySearchNames,
  sortSuggestions,
  toSuggestion,
} from "./match"

const TODAY = "2026-09-29"

type Row = { name: string; quantity: number | null; ingredient_id: number | null; is_staple: boolean; expires_on: string | null }

function item(name: string, extra: Partial<Row> = {}): Row {
  return { name, quantity: 1, ingredient_id: null, is_staple: false, expires_on: null, ...extra }
}

function ing(name: string, id: number | null = null): RecipeIngredient {
  return { id, name, original: name, amount: 1, unit: "", aisle: null }
}

function recipe(id: number, used: RecipeIngredient[], missed: RecipeIngredient[], title = `Recipe ${id}`): RecipeSummary {
  return { id, title, image: null, readyInMinutes: null, servings: null, used, missed }
}

describe("pantrySearchNames", () => {
  it("sends what's available, soonest-expiring first, once per ingredient", () => {
    const names = pantrySearchNames(
      [
        item("Tomatoes"),
        item("spinach", { expires_on: "2026-09-30" }),
        item("eggs", { quantity: 0 }),
        item("salt", { quantity: null, is_staple: true }),
        item("tomato"),
        item("milk", { expires_on: "2026-10-05" }),
      ],
      TODAY,
    )
    expect(names).toEqual(["spinach", "milk", "tomato", "salt"])
  })

  it("drops commas (they separate names) and caps the list", () => {
    expect(pantrySearchNames([item("cheese, cheddar")], TODAY)).toEqual(["cheese cheddar"])
    const many = Array.from({ length: 80 }, (_, i) => item(`thing ${String.fromCharCode(97 + (i % 26))}${i}`))
    expect(pantrySearchNames(many, TODAY)).toHaveLength(MAX_QUERY_NAMES)
  })
})

describe("findInPantry", () => {
  const index = buildPantryIndex(
    [
      item("brown rice"),
      item("chicken"),
      item("garlic"),
      item("Fresh Tomatoes"),
      item("parmesan", { ingredient_id: 1033 }),
      item("butter", { quantity: 0 }),
      item("olive oil", { quantity: null, is_staple: true }),
    ],
    TODAY,
  )

  it("matches by id, name, plural and descriptive words", () => {
    expect(findInPantry(index, ing("parmigiano", 1033))?.name).toBe("parmesan")
    expect(findInPantry(index, ing("tomato"))?.name).toBe("Fresh Tomatoes")
    expect(findInPantry(index, ing("garlic"))?.name).toBe("garlic")
    expect(findInPantry(index, ing("olive oil"))?.name).toBe("olive oil")
  })

  it("lets a more specific pantry item cover a general one, not the other way round", () => {
    expect(findInPantry(index, ing("rice"))?.name).toBe("brown rice")
    expect(findInPantry(index, ing("chicken broth"))).toBeNull()
    expect(findInPantry(index, ing("garlic powder"))).toBeNull()
  })

  it("ignores things that ran out", () => {
    expect(findInPantry(index, ing("butter"))).toBeNull()
  })
})

describe("checkIngredients", () => {
  it("marks have, need, and basics like water", () => {
    const index = buildPantryIndex([item("eggs")], TODAY)
    const checked = checkIngredients(index, [ing("egg"), ing("water"), ing("milk")])
    expect(checked.map((c) => [c.name, c.status, c.pantryName])).toEqual([
      ["egg", "have", "eggs"],
      ["water", "basic", null],
      ["milk", "need", null],
    ])
  })
})

describe("suggestions", () => {
  const index = buildPantryIndex(
    [item("eggs"), item("spinach", { expires_on: "2026-09-30" }), item("rice"), item("soy sauce", { is_staple: true, quantity: null })],
    TODAY,
  )

  it("rescues ingredients Spoonacular missed but the pantry has", () => {
    const s = toSuggestion(index, recipe(1, [ing("eggs")], [ing("soy sauce"), ing("scallions"), ing("water")]))
    expect(s.have).toEqual(["eggs", "soy sauce"])
    expect(s.need).toEqual(["scallions"])
  })

  it("notes expiring food the recipe uses", () => {
    const s = toSuggestion(index, recipe(1, [ing("spinach"), ing("egg")], []))
    expect(s.usesExpiring).toEqual(["spinach"])
  })

  it("splits into make now and almost there, best first", () => {
    const result = sortSuggestions(index, [
      recipe(1, [ing("eggs")], [ing("a"), ing("b")]),
      recipe(2, [ing("eggs"), ing("rice")], []),
      recipe(3, [ing("spinach")], []),
      recipe(4, [ing("eggs")], [ing("a"), ing("b"), ing("c"), ing("d")]),
      recipe(5, [], [ing("a")]),
      recipe(6, [ing("rice")], [ing("x")]),
      recipe(2, [ing("eggs")], []),
    ])
    expect(result.makeNow.map((s) => s.id)).toEqual([3, 2])
    expect(result.almostThere.map((s) => s.id)).toEqual([6, 1])
  })
})
