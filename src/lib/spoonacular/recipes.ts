import "server-only"

import { SpoonacularError, spoonacularFetch, type SpoonacularQuota } from "./client"
import { complexSearchCost, findByIngredientsCost, informationBulkCost, type ComplexSearchOptions } from "./cost"
import { toRecipeDetail, toRecipeSummary, type RecipeDetail, type RecipeSummary } from "./recipe-shapes"

export type { RecipeDetail, RecipeIngredient, RecipeSummary } from "./recipe-shapes"

// Costs are in ./cost.ts (free plan, 50 points a day). Callers cache results for up to
// the 1 hour the terms allow, shared by every household.

/** Spoonacular's own meal types (the complexSearch `type` parameter). */
export const MEAL_TYPES = [
  "main course",
  "side dish",
  "dessert",
  "appetizer",
  "salad",
  "bread",
  "breakfast",
  "soup",
  "beverage",
  "sauce",
  "marinade",
  "fingerfood",
  "snack",
  "drink",
] as const

export type MealType = (typeof MEAL_TYPES)[number]

export type RecipeList = { recipes: RecipeSummary[]; quota: SpoonacularQuota }

/**
 * GET /recipes/findByIngredients, ranked to minimize missing ingredients.
 * ignorePantry leaves out water, salt, flour and the like.
 */
export async function findRecipesByIngredients(ingredients: string[], number = 30): Promise<RecipeList> {
  if (ingredients.length === 0) return { recipes: [], quota: { request: null, used: null, left: null } }
  const { data, quota } = await spoonacularFetch<unknown>("/recipes/findByIngredients", {
    query: { ingredients: ingredients.join(","), number, ranking: 2, ignorePantry: true },
  })
  if (!Array.isArray(data)) throw new SpoonacularError("bad_response", { quota })
  return { recipes: data.flatMap((raw) => toRecipeSummary(raw) ?? []), quota }
}

export type RecipeSearch = {
  ingredients: string[]
  type?: MealType | null
  /** Total minutes, prep included. */
  maxReadyTime?: number | null
  /** Words to look for ("chicken curry"). */
  query?: string | null
  number?: number
}

/**
 * complexSearch add-ons: fillIngredients gives used/missed lists (needed to sort into
 * "Make now" and "Almost there"), addRecipeInformation gives the cook time for the cards.
 * No instructions: the recipe page loads those. Each costs 0.025 per result.
 */
export const SEARCH_ADD_ONS = { fillIngredients: true, addRecipeInformation: true } as const satisfies ComplexSearchOptions

/** What findRecipesByIngredients(…, number) costs at most. */
export const findCost = findByIngredientsCost

/** What searchRecipes({ number }) costs at most. */
export function searchCost(number: number): number {
  return complexSearchCost(number, SEARCH_ADD_ONS)
}

/**
 * GET /recipes/complexSearch for when meal type or time filters are on (findByIngredients
 * can't filter). Sorted by fewest missing ingredients; `includeIngredients` only ranks,
 * it doesn't require every one of them.
 */
export async function searchRecipes({ ingredients, type, maxReadyTime, query: words, number = 30 }: RecipeSearch): Promise<RecipeList> {
  const query: Record<string, string | number | boolean> = {
    ...SEARCH_ADD_ONS,
    ignorePantry: true,
    sort: "min-missing-ingredients",
    number,
  }
  if (ingredients.length > 0) query.includeIngredients = ingredients.join(",")
  if (type) query.type = type
  if (maxReadyTime) query.maxReadyTime = maxReadyTime
  if (words) query.query = words
  const { data, quota } = await spoonacularFetch<unknown>("/recipes/complexSearch", { query })
  const results = data !== null && typeof data === "object" ? (data as { results?: unknown }).results : undefined
  if (!Array.isArray(results)) throw new SpoonacularError("bad_response", { quota })
  return { recipes: results.flatMap((raw) => toRecipeSummary(raw) ?? []), quota }
}

/** GET /recipes/{id}/information (no nutrition). */
export async function getRecipeInformation(id: number): Promise<{ recipe: RecipeDetail; quota: SpoonacularQuota }> {
  if (!Number.isInteger(id) || id <= 0) throw new SpoonacularError("http", { status: 404 })
  const { data, quota } = await spoonacularFetch<unknown>(`/recipes/${id}/information`, {
    query: { includeNutrition: false },
  })
  const recipe = toRecipeDetail(data)
  if (!recipe) throw new SpoonacularError("bad_response", { quota })
  return { recipe, quota }
}

/** Most recipes per informationBulk call. */
export const BULK_LIMIT = 25

/** What getRecipeInformationBulk(ids) costs for `count` recipes. */
export const bulkCost = informationBulkCost

/** GET /recipes/informationBulk (no nutrition). Unknown ids are just left out. */
export async function getRecipeInformationBulk(
  ids: readonly number[],
): Promise<{ recipes: RecipeDetail[]; quota: SpoonacularQuota }> {
  const valid = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0).slice(0, BULK_LIMIT)
  if (valid.length === 0) return { recipes: [], quota: { request: null, used: null, left: null } }
  const { data, quota } = await spoonacularFetch<unknown>("/recipes/informationBulk", {
    query: { ids: valid.join(","), includeNutrition: false },
  })
  if (!Array.isArray(data)) throw new SpoonacularError("bad_response", { quota })
  return { recipes: data.flatMap((raw) => toRecipeDetail(raw) ?? []), quota }
}
