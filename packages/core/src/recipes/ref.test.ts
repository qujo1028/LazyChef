import { describe, expect, it } from "vitest"

import { parseRecipeRef, recipeHref } from "./ref"

describe("recipe refs", () => {
  it("reads Spoonacular ids and our uuids", () => {
    expect(parseRecipeRef("715538")).toEqual({ kind: "spoonacular", id: 715538 })
    expect(parseRecipeRef("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toEqual({
      kind: "local",
      id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    })
  })

  it("rejects anything else", () => {
    for (const bad of ["0", "-1", "1234567890", "12a", "", "not-a-uuid", "../etc", null, 42]) {
      expect(parseRecipeRef(bad)).toBeNull()
    }
  })

  it("links to the recipe page", () => {
    expect(recipeHref("715538")).toBe("/recipes/715538")
  })
})
