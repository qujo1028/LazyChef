import { describe, expect, it } from "vitest"

import type { RecipeIngredient } from "@/lib/spoonacular/recipe-shapes"

import { initialChoices, ranOut, toDeductions, undoAmounts, type CookPantryItem } from "./cook"
import { planCook } from "./cook-plan"

const TODAY = "2026-09-30"

function item(id: string, name: string, quantity: number | null, unit = "count", extra: Partial<CookPantryItem> = {}): CookPantryItem {
  return { id, name, quantity, unit, ingredient_id: null, is_staple: false, expires_on: null, ...extra }
}

function ing(name: string, amount: number | null, unit: string, id: number | null = null): RecipeIngredient {
  return { id, name, original: `${amount ?? ""} ${unit} ${name}`.trim(), amount, unit, aisle: null }
}

const pantry = [
  item("chicken", "chicken breast", 2, "lb", { ingredient_id: 5062 }),
  item("rice", "rice", 3, "cup"),
  item("eggs", "eggs", 6),
  item("garlic", "garlic", 1, "head"),
  item("flour", "flour", 5, "lb"),
  item("salt", "salt", null, "count", { is_staple: true }),
  item("butter", "butter", 0, "stick"),
]

describe("planCook", () => {
  const lines = planCook(
    [
      ing("boneless chicken", 16, "oz", 5062),
      ing("rice", 0.5, "cups"),
      ing("egg", 2, ""),
      ing("garlic", 2, "cloves"),
      ing("flour", 2, "cups"),
      ing("salt", 1, "tsp"),
      ing("water", 1, "cup"),
      ing("butter", 2, "tbsp"),
      ing("capers", 1, "tbsp"),
      ing("rice", null, ""),
    ],
    pantry,
    TODAY,
  )

  it("converts to the pantry item's unit", () => {
    expect(lines[0]).toMatchObject({ kind: "deduct", itemId: "chicken", amount: 1, itemUnit: "lb" })
    expect(lines[1]).toMatchObject({ kind: "deduct", itemId: "rice", amount: 0.5 })
    expect(lines[2]).toMatchObject({ kind: "deduct", itemId: "eggs", amount: 2 })
  })

  it("asks to check amounts it can't convert instead of guessing", () => {
    expect(lines[3]).toMatchObject({ kind: "check", itemId: "garlic" })
    expect(lines[3].kind === "check" && lines[3].reason).toBe("The recipe says 2 cloves; the pantry counts heads.")
    expect(lines[4]).toMatchObject({ kind: "check", itemId: "flour" })
    expect(lines[9]).toMatchObject({ kind: "check", itemId: "rice" })
    expect(lines[9].kind === "check" && lines[9].reason).toBe("The recipe doesn't say how much.")
  })

  it("lists staples, basics and what isn't there", () => {
    expect(lines[5]).toMatchObject({ kind: "untracked", itemName: "salt" })
    expect(lines[6]).toMatchObject({ kind: "basic" })
    expect(lines[7]).toMatchObject({ kind: "missing" }) // butter ran out
    expect(lines[8]).toMatchObject({ kind: "missing" })
  })

  it("starts deduct lines on and check lines skipped", () => {
    const choices = initialChoices(lines)
    expect(choices[0]).toEqual({ skip: false, amount: "1" })
    expect(choices[3]).toEqual({ skip: true, amount: "" })
    expect(choices[5]).toBeUndefined()
  })

  it("builds deductions, with errors for lines that need an amount", () => {
    const choices = { ...initialChoices(lines), 1: { skip: true, amount: "0.5" }, 3: { skip: false, amount: "1/4" }, 4: { skip: false, amount: "" } }
    const { deductions, errors } = toDeductions(lines, choices)
    expect(deductions).toEqual([
      { item_id: "chicken", amount: 1 },
      { item_id: "eggs", amount: 2 },
      { item_id: "garlic", amount: 0.25 },
    ])
    expect(errors).toEqual({ 4: "Enter how much you used, or skip it." })
  })
})

describe("after cooking", () => {
  const results = [
    { item_id: "chicken", name: "chicken breast", unit: "lb", quantity_before: 2, quantity_after: 1 },
    { item_id: "eggs", name: "eggs", unit: "count", quantity_before: 2, quantity_after: 0 },
    { item_id: "eggs", name: "eggs", unit: "count", quantity_before: 0, quantity_after: 0 },
    { item_id: "salt", name: "salt", unit: "count", quantity_before: null, quantity_after: null },
  ]

  it("undoes only what was actually taken", () => {
    expect(undoAmounts(results)).toEqual([
      { item_id: "chicken", amount: 1 },
      { item_id: "eggs", amount: 2 },
    ])
  })

  it("lists what ran out, once", () => {
    expect(ranOut(results)).toEqual([{ id: "eggs", name: "eggs" }])
  })
})
