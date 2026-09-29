import { describe, expect, it } from "vitest"

import type { RecipeIngredient } from "@/lib/spoonacular/recipe-shapes"

import { recipeListLines } from "./list"

const options = { category: () => "other" as const, recipe: { id: 7, title: "Fried Rice" } }

function ing(name: string, amount: number | null, unit: string, extra: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { id: null, name, original: `${amount ?? ""} ${unit} ${name}`.trim(), amount, unit, aisle: null, ...extra }
}

describe("recipeListLines", () => {
  it("keeps amounts in units we know and notes the rest", () => {
    const lines = recipeListLines(
      [ing("rice", 2, "cups"), ing("eggs", 3, ""), ing("garlic", 2, "cloves"), ing("nori", 4, "inches sheets"), ing("thyme", null, "")],
      options,
    )
    expect(lines.map((i) => [i.name, i.quantity, i.unit, i.note])).toEqual([
      ["rice", 2, "cup", null],
      ["eggs", 3, null, null],
      ["garlic", 2, "clove", null],
      ["nori", null, null, "4 inches sheets nori"],
      ["thyme", null, null, "thyme"],
    ])
    expect(lines[0]).toMatchObject({ recipe_id: 7, recipe_title: "Fried Rice", category: "other" })
  })
})
