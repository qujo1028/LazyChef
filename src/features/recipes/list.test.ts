import { describe, expect, it } from "vitest"

import type { RecipeIngredient } from "@/lib/spoonacular/recipe-shapes"

import { planListAdditions } from "./list"

const options = {
  normalize: (name: string) => name.toLowerCase().replace(/s$/, ""),
  category: () => "other" as const,
  recipe: { id: 7, title: "Fried Rice" },
}

function ing(name: string, amount: number | null, unit: string, extra: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return { id: null, name, original: `${amount ?? ""} ${unit} ${name}`.trim(), amount, unit, aisle: null, ...extra }
}

describe("planListAdditions", () => {
  it("keeps amounts in units we know and notes the rest", () => {
    const { items } = planListAdditions(
      [ing("rice", 2, "cups"), ing("eggs", 3, ""), ing("garlic", 2, "cloves"), ing("nori", 4, "inches sheets"), ing("thyme", null, "")],
      [],
      options,
    )
    expect(items.map((i) => [i.name, i.quantity, i.unit, i.note])).toEqual([
      ["rice", 2, "cup", null],
      ["eggs", 3, null, null],
      ["garlic", 2, "clove", null],
      ["nori", null, null, "4 inches sheets nori"],
      ["thyme", null, null, "thyme"],
    ])
    expect(items[0]).toMatchObject({ recipe_id: 7, recipe_title: "Fried Rice", category: "other" })
  })

  it("skips what's already on the list, by id or name", () => {
    const result = planListAdditions(
      [ing("scallions", 2, "", { id: 11291 }), ing("egg", 1, ""), ing("peas", 1, "cup")],
      [
        { name: "green onions", ingredient_id: 11291 },
        { name: "Eggs", ingredient_id: null },
      ],
      options,
    )
    expect(result.items.map((i) => i.name)).toEqual(["peas"])
    expect(result.alreadyOnList).toBe(2)
  })

  it("merges the same ingredient listed twice", () => {
    const same = planListAdditions([ing("soy sauce", 1, "tbsp"), ing("soy sauce", 2, "tbsp")], [], options)
    expect(same.items).toHaveLength(1)
    expect(same.items[0]).toMatchObject({ quantity: 3, unit: "tbsp" })
    const mixed = planListAdditions([ing("butter", 1, "tbsp"), ing("butter", 1, "cup")], [], options)
    expect(mixed.items[0]).toMatchObject({ quantity: null, unit: null })
  })
})
