import "server-only"

import { SpoonacularError, spoonacularFetch, type SpoonacularQuota } from "./client"
import { toRecipeDetail, toRecipeSummary, type RecipeDetail, type RecipeSummary } from "./recipe-shapes"

export type { RecipeDetail, RecipeIngredient, RecipeSummary } from "./recipe-shapes"

// Costs (free plan, 50 points a day):
//   findByIngredients: 1 point + 0.01 per recipe returned
//   complexSearch:     1 point + 0.01 per recipe, + 0.025 per recipe for fillIngredients
//                      and another 0.025 for addRecipeInformation
//   information:       1 point
// Callers cache results (up to the 1 hour the terms allow) so housemates share them.

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
  number?: number
}

/**
 * GET /recipes/complexSearch for when meal type or time filters are on (findByIngredients
 * can't filter). Sorted by fewest missing ingredients; `includeIngredients` only ranks,
 * it doesn't require every one of them.
 */
export async function searchRecipes({ ingredients, type, maxReadyTime, number = 30 }: RecipeSearch): Promise<RecipeList> {
  const query: Record<string, string | number | boolean> = {
    includeIngredients: ingredients.join(","),
    fillIngredients: true,
    addRecipeInformation: true,
    ignorePantry: true,
    sort: "min-missing-ingredients",
    number,
  }
  if (type) query.type = type
  if (maxReadyTime) query.maxReadyTime = maxReadyTime
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
