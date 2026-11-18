import { describe, expect, it } from "vitest"

import { categoryFromAisle } from "./aisles"
import type { Category } from "./types"

describe("categoryFromAisle", () => {
  it.each([
    ["Produce", "produce"],
    ["Meat", "meat"],
    ["Seafood", "seafood"],
    ["Milk, Eggs, Other Dairy", "dairy"],
    ["Cheese", "dairy"],
    ["Bakery/Bread", "bakery"],
    ["Bread", "bakery"],
    ["Pasta and Rice", "grains"],
    ["Cereal", "grains"],
    ["Baking", "baking"],
    ["Spices and Seasonings", "spices"],
    ["Canned and Jarred", "canned"],
    ["Frozen", "frozen"],
    ["Oil, Vinegar, Salad Dressing", "condiments"],
    ["Condiments", "condiments"],
    ["Nut butters, Jams, and Honey", "condiments"],
    ["Savory Snacks", "snacks"],
    ["Sweet Snacks", "snacks"],
    ["Nuts", "snacks"],
    ["Dried Fruits", "snacks"],
    ["Beverages", "beverages"],
    ["Tea and Coffee", "beverages"],
    ["Alcoholic Beverages", "beverages"],
    // aisles that don't say where in the store something is
    ["Ethnic Foods", "other"],
    ["Health Foods", "other"],
    ["Gourmet", "other"],
    ["Refrigerated", "other"],
    ["Gluten Free", "other"],
    ["Grilling Supplies", "other"],
    ["Not in Grocery Store/Homemade", "other"],
    ["Online", "other"],
    ["?", "other"],
  ] satisfies [string, Category][])("%j → %s", (aisle, expected) => {
    expect(categoryFromAisle(aisle)).toBe(expected)
  })

  it.each([
    // semicolon lists: the first aisle that names a section
    ["Baking;Spices and Seasonings", "baking"],
    ["Spices and Seasonings;Baking", "spices"],
    ["Ethnic Foods;Spices and Seasonings", "spices"],
    ["Health Foods;Baking", "baking"],
    ["Refrigerated;Milk, Eggs, Other Dairy", "dairy"],
    ["Gourmet;Online", "other"],
    ["Produce;", "produce"],
    [";Frozen", "frozen"],
    // spacing and case
    ["  milk, eggs, other dairy ", "dairy"],
    ["Bakery / Bread", "bakery"],
    ["NUT BUTTERS,JAMS, AND HONEY", "condiments"],
    ["Tea & Coffee", "beverages"],
  ] satisfies [string, Category][])("%j → %s", (aisle, expected) => {
    expect(categoryFromAisle(aisle)).toBe(expected)
  })

  it.each([[null], [undefined], [""], [";"], ["Garden Center"], ["constructor"], ["__proto__"], ["toString"]])(
    "%j → other",
    (aisle) => {
      expect(categoryFromAisle(aisle)).toBe("other")
    },
  )
})
