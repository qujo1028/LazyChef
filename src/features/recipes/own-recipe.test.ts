import { describe, expect, it } from "vitest"

import {
  fieldErrors,
  fitWithin,
  isHouseholdPhoto,
  parseIngredientLines,
  photoPathFor,
  recipePayload,
  validateOwnRecipe,
  type OwnRecipeInput,
} from "./own-recipe"

const HOUSEHOLD = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

function draft(extra: Partial<OwnRecipeInput> = {}): OwnRecipeInput {
  return {
    title: "Grandma's Pancakes",
    readyInMinutes: "20",
    servings: "4",
    mealTypes: ["breakfast"],
    ingredients: "2 cups flour\n2 eggs\n1 cup milk",
    steps: ["Mix.", "Fry."],
    photoPath: null,
    ...extra,
  }
}

describe("the ingredient box", () => {
  it("reads one ingredient per line with the pantry's parser, keeping the line as written", () => {
    const { lines, problems } = parseIngredientLines("2 cloves garlic, minced\n\n1 (14 oz) can coconut milk\n  salt  ")
    expect(problems).toEqual([])
    expect(lines).toEqual([
      { original: "2 cloves garlic, minced", name: "garlic", quantity: 2, unit: "clove", optional: false },
      expect.objectContaining({ original: "1 (14 oz) can coconut milk", name: "coconut milk" }),
      { original: "salt", name: "salt", quantity: null, unit: null, optional: false },
    ])
  })

  it("drops list markers and marks optional lines", () => {
    const { lines } = parseIngredientLines("- 1 lemon\n2. parsley (optional)\n• berries, to serve")
    expect(lines.map((line) => [line.original, line.name, line.optional])).toEqual([
      ["1 lemon", "lemon", false],
      ["parsley (optional)", "parsley", true],
      ["berries, to serve", "berries", true],
    ])
  })

  it("reports lines with no ingredient in them", () => {
    expect(parseIngredientLines("2\neggs").problems).toEqual(["2"])
  })
})

describe("form validation", () => {
  it("accepts a normal recipe and tidies it up", () => {
    const result = validateOwnRecipe(draft({ title: "  Grandma's   Pancakes ", steps: [" Mix. ", "", "Fry."] }))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toMatchObject({ title: "Grandma's Pancakes", readyInMinutes: 20, servings: 4, steps: ["Mix.", "Fry."] })
    expect(result.data.ingredients.map((line) => line.name)).toEqual(["flour", "eggs", "milk"])
    expect(recipePayload(result.data)).toEqual({
      title: "Grandma's Pancakes",
      meal_types: ["breakfast"],
      ready_in_minutes: 20,
      servings: 4,
      instructions: ["Mix.", "Fry."],
      photo_path: null,
    })
  })

  it("leaves time and servings empty when blank", () => {
    const result = validateOwnRecipe(draft({ readyInMinutes: "", servings: null }))
    expect(result.success && [result.data.readyInMinutes, result.data.servings]).toEqual([null, null])
  })

  it("points at the field that needs fixing", () => {
    const errors = (input: Partial<OwnRecipeInput>) => {
      const result = validateOwnRecipe(draft(input))
      return result.success ? {} : fieldErrors(result.error)
    }
    expect(errors({ title: "   " })).toEqual({ title: "Give it a name." })
    expect(errors({ title: "x".repeat(201) })).toEqual({ title: "That name is too long." })
    expect(errors({ readyInMinutes: "ten" }).readyInMinutes).toMatch(/whole number/)
    expect(errors({ readyInMinutes: "0" }).readyInMinutes).toMatch(/from 1 to 2880/)
    expect(errors({ servings: "2.5" }).servings).toMatch(/whole number/)
    expect(errors({ ingredients: "  \n " }).ingredients).toMatch(/at least one ingredient/)
    expect(errors({ ingredients: "eggs\n12" }).ingredients).toMatch(/Couldn't read “12”/)
    expect(errors({ ingredients: Array.from({ length: 101 }, (_, i) => `${i + 1} eggs`).join("\n") }).ingredients).toMatch(/100/)
    expect(errors({ mealTypes: ["brunch"] }).mealTypes).toBeDefined()
    expect(errors({ steps: Array.from({ length: 61 }, () => "Stir.") }).steps).toMatch(/60 steps/)
    expect(errors({ steps: ["x".repeat(2001)] }).steps).toMatch(/2000/)
    expect(errors({ photoPath: "../other/x.webp" }).photoPath).toMatch(/photo/)
  })

  it("de-duplicates meal types", () => {
    const result = validateOwnRecipe(draft({ mealTypes: ["breakfast", "breakfast", "dessert"] }))
    expect(result.success && result.data.mealTypes).toEqual(["breakfast", "dessert"])
  })
})

describe("photos", () => {
  it("live in the household's own folder", () => {
    const path = photoPathFor(HOUSEHOLD, "abc123")
    expect(path).toBe(`${HOUSEHOLD}/abc123.webp`)
    expect(isHouseholdPhoto(path, HOUSEHOLD)).toBe(true)
    expect(isHouseholdPhoto(`00000000-0000-0000-0000-000000000000/abc.webp`, HOUSEHOLD)).toBe(false)
    expect(isHouseholdPhoto(`${HOUSEHOLD}/../x.webp`, HOUSEHOLD)).toBe(false)
    expect(isHouseholdPhoto(`${HOUSEHOLD}/a/b.webp`, HOUSEHOLD)).toBe(false)
  })

  it("are shrunk to fit, never enlarged", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(0, 600, 1600)).toEqual({ width: 0, height: 0 })
  })
})
