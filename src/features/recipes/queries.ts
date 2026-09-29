import "server-only"

import { cache } from "react"

import { getPantryItems } from "@/features/pantry/queries"
import { localDateKey } from "@/features/pantry/dates"
import { normalizeIngredientName } from "@/lib/ingredients/catalog"
import {
  findCost,
  findRecipesByIngredients,
  getRecipeInformation,
  isSpoonacularConfigured,
  recipeInformationCost,
  searchCost,
  searchRecipes,
  SpoonacularError,
  type RecipeDetail,
  type RecipeSummary,
} from "@/lib/spoonacular"
import { createClient } from "@/lib/supabase/server"

import { cachedSpoonacular, getCacheStore, getUsageToday } from "./cache"
import { recipeCacheKey, restingUntil, suggestionsCacheKey, type Usage } from "./cache-core"
import type { CookLine } from "./cook"
import { planCook } from "./cook-plan"
import { hasFilters, type RecipeFilters } from "./filters"
import { buildPantryIndex, checkIngredients, pantrySearchNames, sortSuggestions, type CheckedIngredient, type Suggestions } from "./match"

/**
 * How many recipes to ask for. findByIngredients is cheap (40 → 1.4 points). complexSearch
 * with its add-ons costs 0.06 per result, so it asks for fewer (20 → 2.2 points).
 */
const FIND_SIZE = 40
const SEARCH_SIZE = 20

export type SpoonacularProblem = { code: SpoonacularError["code"]; message: string }

export type SuggestionsResult =
  | { status: "no-key" }
  | { status: "empty-pantry" }
  /** Today's points are used up (or nearly): searches wait for midnight UTC. */
  | { status: "resting"; resetsAt: string; usage: Usage | null }
  | { status: "error"; problem: SpoonacularProblem }
  | ({ status: "ok"; savedAt: string; usage: Usage | null; searched: number } & Suggestions)

function problem(error: unknown, context: string): SpoonacularProblem {
  if (error instanceof SpoonacularError) {
    console.warn(`[spoonacular] ${context} failed: ${error.code}${error.status ? ` (${error.status})` : ""}`)
    return { code: error.code, message: error.message }
  }
  console.error(`[spoonacular] ${context} failed`, error)
  return { code: "http", message: "Couldn't load recipes right now." }
}

function isQuota(error: unknown) {
  return error instanceof SpoonacularError && error.code === "quota"
}

/**
 * findByIngredients doesn't say how long a recipe takes. Fill that in from recipes someone
 * opened in the last hour (already in the shared cache, so it costs nothing).
 */
async function withCachedTimes(recipes: RecipeSummary[]): Promise<RecipeSummary[]> {
  const missing = recipes.filter((recipe) => recipe.readyInMinutes === null)
  if (missing.length === 0) return recipes
  const found = await getCacheStore().getMany(missing.map((recipe) => recipeCacheKey(recipe.id)))
  if (found.size === 0) return recipes
  return recipes.map((recipe) => {
    const detail = found.get(recipeCacheKey(recipe.id)) as Partial<RecipeDetail> | undefined
    return detail && recipe.readyInMinutes === null && typeof detail.readyInMinutes === "number"
      ? { ...recipe, readyInMinutes: detail.readyInMinutes }
      : recipe
  })
}

/**
 * "Make now" and "Almost there" for the household's pantry. Results are cached for an hour
 * under the pantry's names plus the filters, shared by every household.
 */
export async function getRecipeSuggestions(householdId: string, filters: RecipeFilters): Promise<SuggestionsResult> {
  const items = await getPantryItems(householdId)
  const today = localDateKey()
  const names = pantrySearchNames(items, today)
  if (names.length === 0) return { status: "empty-pantry" }
  if (!isSpoonacularConfigured()) return { status: "no-key" }

  const filtered = hasFilters(filters)
  const key = suggestionsCacheKey(names, filters)

  try {
    const result = await cachedSpoonacular<RecipeSummary[]>(
      getCacheStore(),
      key,
      async () => {
        const { recipes, quota } = filtered
          ? await searchRecipes({ ingredients: names, type: filters.type, maxReadyTime: filters.maxTime, number: SEARCH_SIZE })
          : await findRecipesByIngredients(names, FIND_SIZE)
        return { value: recipes, quota }
      },
      { cost: filtered ? searchCost(SEARCH_SIZE) : findCost(FIND_SIZE) },
    )
    const index = buildPantryIndex(items, today)
    return {
      status: "ok",
      savedAt: result.savedAt,
      usage: result.usage,
      searched: result.value.length,
      ...sortSuggestions(index, await withCachedTimes(result.value)),
    }
  } catch (error) {
    if (isQuota(error)) return { status: "resting", resetsAt: restingUntil(), usage: await getUsageToday() }
    return { status: "error", problem: problem(error, "recipe search") }
  }
}

/** One recipe, fetched at most once an hour for everyone (the info endpoint costs a point). */
export const getRecipe = cache(async (recipeId: number) => {
  return cachedSpoonacular<RecipeDetail>(
    getCacheStore(),
    recipeCacheKey(recipeId),
    async () => {
      const { recipe, quota } = await getRecipeInformation(recipeId)
      return { value: recipe, quota }
    },
    // Opening a recipe someone found is worth more than a new search: only keep 1 point back.
    { cost: recipeInformationCost(), reserve: 1 },
  )
})

export type RecipeDetailResult =
  | { status: "no-key" }
  | { status: "not-found" }
  | { status: "resting"; resetsAt: string }
  | { status: "error"; problem: SpoonacularProblem }
  | {
      status: "ok"
      recipe: RecipeDetail
      ingredients: CheckedIngredient[]
      /** Normalized names (and ids) of unchecked shopping list lines. */
      onList: { keys: string[]; ids: number[] }
      /** "I cooked this": what comes out of the pantry for each ingredient. */
      cook: CookLine[]
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
      getRecipe(recipeId),
      getPantryItems(householdId),
      getOpenListLines(householdId),
    ])
    const today = localDateKey()
    const index = buildPantryIndex(items, today)
    return {
      status: "ok",
      recipe,
      ingredients: checkIngredients(index, recipe.ingredients),
      cook: planCook(recipe.ingredients, items, today),
      onList: {
        keys: lines.map((line) => normalizeIngredientName(line.name)),
        ids: lines.flatMap((line) => (line.ingredient_id === null ? [] : [line.ingredient_id])),
      },
    }
  } catch (error) {
    if (error instanceof SpoonacularError && error.status === 404) return { status: "not-found" }
    if (isQuota(error)) return { status: "resting", resetsAt: restingUntil() }
    return { status: "error", problem: problem(error, "recipe details") }
  }
}
