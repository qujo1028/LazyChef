import { describe, expect, it } from "vitest"

import { checkLibraryRecipe, titleKey, toLibraryIngredient, type DraftRecipe } from "./lazychef"

function draft(overrides: Partial<DraftRecipe> = {}): DraftRecipe {
  return {
    slug: "us-baked-mac-and-cheese",
    title: "Baked Mac and Cheese",
    summary: "Creamy cheddar macaroni baked under a crisp crumb top.",
    cuisine: "United States",
    meal_types: ["main course", "side dish"],
    servings: 6,
    ready_in_minutes: 45,
    ingredients: [
      { amount: "8 oz", name: "elbow macaroni" },
      { amount: "2 cups", name: "shredded cheddar cheese" },
      { amount: "2 cloves", name: "garlic", prep: "minced" },
      { amount: "", name: "salt", prep: "to taste" },
    ],
    steps: ["Heat the oven.", "Boil the pasta.", "Make the sauce.", "Stir it together.", "Bake until bubbly."],
    ...overrides,
  }
}

describe("toLibraryIngredient", () => {
  it("parses like the TheMealDB import and keeps prep out of the name", () => {
    const row = toLibraryIngredient({ amount: "2 cloves", name: "garlic", prep: "minced" }, 3)
    expect(row).toMatchObject({ position: 3, name: "garlic", quantity: 2, unit: "clove", original: "2 cloves garlic, minced" })
    expect(row?.ingredient_id).not.toBeNull()
  })

  it("marks optional lines", () => {
    expect(toLibraryIngredient({ amount: "", name: "cilantro", prep: "optional, for serving" }, 0)?.optional).toBe(true)
    expect(toLibraryIngredient({ amount: "1 tbsp", name: "sesame seeds", optional: true }, 0)?.optional).toBe(true)
  })
})

describe("checkLibraryRecipe", () => {
  it("converts a good recipe with no issues", () => {
    const { recipe, issues } = checkLibraryRecipe(draft())
    expect(issues).toEqual([])
    expect(recipe).toMatchObject({ source: "lazychef", source_id: "us-baked-mac-and-cheese", extended: false, image_url: null })
    expect(recipe?.ingredients).toHaveLength(4)
  })

  it("rejects what the database would refuse", () => {
    expect(checkLibraryRecipe(draft({ slug: "Mac & Cheese" })).recipe).toBeNull()
    expect(checkLibraryRecipe(draft({ cuisine: "American" })).recipe).toBeNull()
    expect(checkLibraryRecipe(draft({ meal_types: ["dinner"] })).recipe).toBeNull()
    expect(checkLibraryRecipe(draft({ ingredients: [] })).recipe).toBeNull()
  })

  it("flags unmatched names, prep in names, unread units and em dashes", () => {
    const { recipe, issues } = checkLibraryRecipe(
      draft({
        title: "Mac — Cheese",
        ingredients: [
          { amount: "1 inch", name: "ginger" },
          { amount: "2 cloves", name: "minced garlic" },
          { amount: "2", name: "zzqx glorp" },
          { amount: "1 (4 lb) whole chicken", name: "whole chicken" },
        ],
      }),
    )
    expect(recipe).not.toBeNull()
    expect(issues.join("\n")).toMatch(/unit not read/)
    expect(issues.join("\n")).toMatch(/prep words/)
    expect(issues.join("\n")).toMatch(/doesn't match/)
    expect(issues.join("\n")).toMatch(/em dash/)
    expect(issues.join("\n")).toMatch(/repeated in the amount/)
  })

  it("doesn't flag counts or things sold diced or sliced", () => {
    const { issues } = checkLibraryRecipe(
      draft({
        ingredients: [
          { amount: "1 medium", name: "yellow onion", prep: "diced" },
          { amount: "2 stalks", name: "celery" },
          { amount: "1 (15 oz) can", name: "diced tomatoes" },
          { amount: "1/2 cup", name: "sliced almonds" },
        ],
      }),
    )
    expect(issues).toEqual([])
  })

  it("needs credit for attributed photos and none for AI ones", () => {
    const commons = { url: "https://x.supabase.co/a.jpg", ai_generated: false, license: "CC BY-SA 4.0" }
    expect(checkLibraryRecipe(draft({ photo: commons })).recipe).toBeNull()
    const credited = checkLibraryRecipe(
      draft({ photo: { ...commons, author: "Jane", source_url: "https://commons.wikimedia.org/wiki/File:A.jpg" } }),
    ).recipe
    expect(credited).toMatchObject({ image_license: "CC BY-SA 4.0", image_author: "Jane", image_ai_generated: false })
    const ai = checkLibraryRecipe(draft({ photo: { url: "https://x.supabase.co/a.jpg", ai_generated: true } })).recipe
    expect(ai).toMatchObject({ image_ai_generated: true, image_license: null, image_author: null })
    expect(checkLibraryRecipe(draft({ photo: { ...commons, license: "CC BY-NC 4.0", author: "J" } })).recipe).toBeNull()
  })
})

describe("titleKey", () => {
  it("treats spellings of one dish alike", () => {
    expect(titleKey("General Tso's Chicken")).toBe(titleKey("General Tsos Chicken"))
    expect(titleKey("Classic Pancakes")).toBe(titleKey("Pancakes"))
    expect(titleKey("Baked Mac and Cheese")).not.toBe(titleKey("Grilled Mac and Cheese Sandwich"))
  })
})
