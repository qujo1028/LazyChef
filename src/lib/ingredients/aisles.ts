// Spoonacular's grocery aisles → our categories. Pure module.
import type { Category } from "./types"

/**
 * Every aisle Spoonacular uses, lowercased. null: the aisle doesn't say where in a store the
 * thing is (Ethnic Foods, Health Foods, Gourmet …), so it doesn't decide the category.
 */
const AISLES: ReadonlyMap<string, Category | null> = new Map(
  Object.entries({
    produce: "produce",
    meat: "meat",
    seafood: "seafood",
    "milk, eggs, other dairy": "dairy",
    cheese: "dairy",
    "bakery/bread": "bakery",
    bread: "bakery",
    "pasta and rice": "grains",
    cereal: "grains",
    baking: "baking",
    "spices and seasonings": "spices",
    "canned and jarred": "canned",
    frozen: "frozen",
    "oil, vinegar, salad dressing": "condiments",
    condiments: "condiments",
    "nut butters, jams, and honey": "condiments",
    "savory snacks": "snacks",
    "sweet snacks": "snacks",
    nuts: "snacks",
    "dried fruits": "snacks",
    beverages: "beverages",
    "tea and coffee": "beverages",
    "alcoholic beverages": "beverages",
    "ethnic foods": null,
    "health foods": null,
    gourmet: null,
    refrigerated: null,
    "gluten free": null,
    "grilling supplies": null,
    "not in grocery store/homemade": null,
    online: null,
    "?": null,
  } satisfies Record<string, Category | null>),
)

/** "Bakery / Bread " → "bakery/bread", "Nut Butters, Jams, and Honey" → "nut butters, jams, and honey". */
function aisleKey(aisle: string): string {
  return aisle
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ ?\/ ?/g, "/")
    .replace(/ ?, ?/g, ", ")
    .replace(/ ?& ?/g, " and ")
    .trim()
}

/**
 * Spoonacular aisle ("Milk, Eggs, Other Dairy", "Baking;Spices and Seasonings", …) → our category.
 * For a semicolon list, the first aisle that names a section wins ("Ethnic Foods;Spices and
 * Seasonings" → spices). Unknown, empty or only vague aisles → "other".
 */
export function categoryFromAisle(aisle: string | null | undefined): Category {
  if (!aisle) return "other"
  for (const part of aisle.split(";")) {
    const category = AISLES.get(aisleKey(part))
    if (category) return category
  }
  return "other"
}
