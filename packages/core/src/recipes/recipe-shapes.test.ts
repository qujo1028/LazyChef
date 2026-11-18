import { describe, expect, it } from "vitest"

import { safeUrl, stripHtml, toRecipeDetail, toRecipeIngredient, toRecipeSummary } from "./recipe-shapes"

describe("recipe shapes", () => {
  it("reads a findByIngredients result", () => {
    const summary = toRecipeSummary({
      id: 648742,
      title: " Kappa Maki ",
      image: "https://img.spoonacular.com/recipes/648742-312x231.jpg",
      usedIngredientCount: 1,
      missedIngredients: [
        { id: 11206, amount: 2, unit: "", aisle: "Produce", name: "japanese cucumber", original: "2 Japanese cucumber, cut into long sticks" },
        { name: "" },
      ],
      usedIngredients: [{ id: 10220054, amount: 4, unit: "cups", aisle: "Pasta and Rice", name: "sushi rice", original: "4 cups sushi rice" }],
    })
    expect(summary).toEqual({
      id: 648742,
      title: "Kappa Maki",
      image: "https://img.spoonacular.com/recipes/648742-312x231.jpg",
      readyInMinutes: null,
      servings: null,
      used: [{ id: 10220054, name: "sushi rice", original: "4 cups sushi rice", amount: 4, unit: "cups", aisle: "Pasta and Rice" }],
      missed: [
        { id: 11206, name: "japanese cucumber", original: "2 Japanese cucumber, cut into long sticks", amount: 2, unit: "", aisle: "Produce" },
      ],
    })
  })

  it("rejects results without an id or title", () => {
    expect(toRecipeSummary({ title: "x" })).toBeNull()
    expect(toRecipeSummary({ id: 3 })).toBeNull()
    expect(toRecipeSummary(null)).toBeNull()
  })

  it("prefers nameClean and drops unknown aisles", () => {
    expect(toRecipeIngredient({ id: 1, name: "Boneless Chicken", nameClean: "chicken breast", aisle: "?" })).toMatchObject({
      name: "chicken breast",
      aisle: null,
      original: "chicken breast",
    })
  })

  it("reads recipe details, steps and a plain-text summary", () => {
    const detail = toRecipeDetail({
      id: 5,
      title: "Soup",
      readyInMinutes: 30,
      servings: 4,
      sourceUrl: "javascript:alert(1)",
      creditsText: "foodista.com",
      summary: "<b>Warm</b> &amp; cozy.",
      extendedIngredients: [{ id: 1, name: "onion", original: "1 onion", amount: 1, unit: "" }],
      analyzedInstructions: [{ steps: [{ number: 1, step: "Chop." }, { number: 2, step: " Simmer. " }] }],
      dishTypes: ["soup", 3],
    })
    expect(detail).toMatchObject({
      sourceUrl: null,
      sourceName: "foodista.com",
      summary: "Warm & cozy.",
      steps: ["Chop.", "Simmer."],
      dishTypes: ["soup"],
    })
    expect(detail?.ingredients).toHaveLength(1)
  })

  it("falls back to plain instructions", () => {
    const detail = toRecipeDetail({ id: 5, title: "Soup", instructions: "<ol><li>Boil water.</li><li>Add <i>pasta</i>.</li></ol>" })
    expect(detail?.steps).toEqual(["Boil water.", "Add pasta."])
  })

  it("keeps only web links and strips tags", () => {
    expect(safeUrl("https://a.com/x")).toBe("https://a.com/x")
    expect(safeUrl("data:text/html,hi")).toBeNull()
    expect(stripHtml("a<br>b")).toBe("a b")
  })
})
