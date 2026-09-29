import "server-only"

import { cache } from "react"

import { getPantryItems } from "@/features/pantry/queries"
import { localDateKey } from "@/features/pantry/dates"
import { normalizeIngredientName } from "@/lib/ingredients/catalog"
import {
  findRecipesByIngredients,
  getRecipeInformation,
  isSpoonacularConfigured,
  searchRecipes,
  SpoonacularError,
  type RecipeDetail,
  type RecipeSummary,
} from "@/lib/spoonacular"
import { createClient } from "@/lib/supabase/server"

import { cachedSpoonacular, cacheKey, type Usage } from "./cache"
import { hasFilters, type RecipeFilters } from "./filters"
import { buildPantryIndex, checkIngredients, pantrySearchNames, sortSuggestions, type CheckedIngredient, type Suggestions } from "./match"

/** How many recipes to ask for per search. More finds more "Make now" hits; each costs 0.01+ points. */
const SEARCH_SIZE = 40

export type SpoonacularProblem = { code: SpoonacularError["code"]; message: string }

export type SuggestionsResult =
  | { status: "no-key" }
  | { status: "empty-pantry" }
  | { status: "error"; problem: SpoonacularProblem; usage: Usage | null }
  | ({ status: "ok"; savedAt: string; usage: Usage | null; searched: number } & Suggestions)

function problem(error: unknown, context: string): SpoonacularProblem {
  if (error instanceof SpoonacularError) {
    console.warn(`[spoonacular] ${context} failed: ${error.code}${error.status ? ` (${error.status})` : ""}`)
    return { code: error.code, message: error.message }
  }
  console.error(`[spoonacular] ${context} failed`, error)
  return { code: "http", message: "Couldn't load recipes right now." }
}

/** "Make now" and "Almost there" for the household's pantry, cached for an hour per household. */
export async function getRecipeSuggestions(householdId: string, filters: RecipeFilters): Promise<SuggestionsResult> {
  const items = await getPantryItems(householdId)
  const today = localDateKey()
  const names = pantrySearchNames(items, today)
  if (names.length === 0) return { status: "empty-pantry" }
  if (!isSpoonacularConfigured()) return { status: "no-key" }

  // The key is the set of ingredients, not their order, so a new expiry date doesn't cost a search.
  const keys = [...new Set(names.map(normalizeIngredientName))].sort()
  const filtered = hasFilters(filters)
  const key = filtered
    ? cacheKey("search", [...keys, `type=${filters.type ?? ""}`, `time=${filters.maxTime ?? ""}`])
    : cacheKey("find", keys)

  try {
    const result = await cachedSpoonacular<RecipeSummary[]>(householdId, key, async () => {
      const { recipes, quota } = filtered
        ? await searchRecipes({ ingredients: names, type: filters.type, maxReadyTime: filters.maxTime, number: SEARCH_SIZE })
        : await findRecipesByIngredients(names, SEARCH_SIZE)
      return { value: recipes, quota }
    })
    const index = buildPantryIndex(items, today)
    return {
      status: "ok",
      savedAt: result.savedAt,
      usage: result.usage,
      searched: result.value.length,
      ...sortSuggestions(index, result.value),
    }
  } catch (error) {
    return { status: "error", problem: problem(error, "recipe search"), usage: null }
  }
}

/** One recipe, fetched once an hour per household (Spoonacular's info endpoint costs a point). */
export const getRecipe = cache(async (householdId: string, recipeId: number) => {
  return cachedSpoonacular<RecipeDetail>(householdId, `info:${recipeId}`, async () => {
    const { recipe, quota } = await getRecipeInformation(recipeId)
    return { value: recipe, quota }
  }, { reserve: 1 })
})

export type RecipeDetailResult =
  | { status: "no-key" }
  | { status: "not-found" }
  | { status: "error"; problem: SpoonacularProblem }
  | {
      status: "ok"
      recipe: RecipeDetail
      ingredients: CheckedIngredient[]
      /** Normalized names (and ids) of unchecked shopping list lines. */
      onList: { keys: string[]; ids: number[] }
    }

async function getOpenListLines(householdId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("name, ingredient_id")
    .eq("household_id", householdId)
    .is("checked_at", null)
  if (error) throw error
  return data
}

export async function getRecipeDetail(householdId: string, recipeId: number): Promise<RecipeDetailResult> {
  if (!isSpoonacularConfigured()) return { status: "no-key" }
  try {
    const [{ value: recipe }, items, lines] = await Promise.all([
      getRecipe(householdId, recipeId),
      getPantryItems(householdId),
      getOpenListLines(householdId),
    ])
    const index = buildPantryIndex(items, localDateKey())
    return {
      status: "ok",
      recipe,
      ingredients: checkIngredients(index, recipe.ingredients),
      onList: {
        keys: lines.map((line) => normalizeIngredientName(line.name)),
        ids: lines.flatMap((line) => (line.ingredient_id === null ? [] : [line.ingredient_id])),
      },
    }
  } catch (error) {
    if (error instanceof SpoonacularError && error.status === 404) return { status: "not-found" }
    return { status: "error", problem: problem(error, "recipe details") }
  }
}
