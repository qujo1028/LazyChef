import { describe, expect, it } from "vitest"

import { recipePayload, validateOwnRecipe } from "../recipes/own-recipe"
import type { AiIdeaRecipe } from "./edge-contract"
import { ingredientRows, mealTypesFor, ownInputFromIdea } from "./idea-save"

const idea: AiIdeaRecipe = {
  title: "Egg fried rice",
  description: "Quick and filling.",
  servings: 2,
  minutes: 15,
  ingredients: [
    { name: "eggs", amount: "2", fromPantry: true },
    { name: "salt", amount: "", fromPantry: true },
  ],
  steps: ["Cook the rice.", "Fry it all."],
}

describe("idea-save", () => {
  it("files an idea under its meal, and any meal under none", () => {
    expect(mealTypesFor("dessert")).toEqual(["dessert"])
    expect(mealTypesFor("any")).toEqual([])
  })

  it("builds a valid recipe input", () => {
    const input = ownInputFromIdea(idea, "main course")
    expect(input.ingredients).toBe("2 eggs\nsalt")
    expect(input.photoPath).toBeNull()
    const parsed = validateOwnRecipe(input)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(recipePayload(parsed.data).meal_types).toEqual(["main course"])
    const rows = ingredientRows(parsed.data)
    expect(rows).toHaveLength(2)
    expect(rows[0].name_key).toBeTruthy()
  })
})
