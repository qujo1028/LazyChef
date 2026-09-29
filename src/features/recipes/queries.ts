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

import { cachedRecipeDetails, cachedSpoonacular, cacheKey, recipeInfoKey, type Usage } from "./cache"
import type { CookLine } from "./cook"
import { planCook } from "./cook-plan"
import { hasFilters, type RecipeFilters } from "./filters"
import {
  buildPantryIndex,
  checkIngredients,
  pantrySearchNames,
  sortSuggestions,
  toSuggestion,
  type CheckedIngredient,
  type Suggestions,
} from "./match"
import { cookHistory, type SavedRecipe } from "./saved"

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
  return cachedSpoonacular<RecipeDetail>(householdId, recipeInfoKey(recipeId), async () => {
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
      getRecipe(householdId, recipeId),
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
    return { status: "error", problem: problem(error, "recipe details") }
  }
}

/** Ids of the household's saved recipes, for the hearts. */
export const getSavedIds = cache(async (householdId: string): Promise<Set<number>> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from("saved_recipes").select("recipe_id").eq("household_id", householdId)
  if (error) throw error
  return new Set(data.map((row) => Number(row.recipe_id)))
})

/** Where Spoonacular keeps a recipe's photo, for saved recipes whose details aren't loaded. */
function fallbackImage(recipeId: number) {
  return `https://img.spoonacular.com/recipes/${recipeId}-312x231.jpg`
}

export type SavedRecipesResult = {
  recipes: SavedRecipe[]
  /** How many couldn't be matched against the pantry right now. */
  unmatched: number
  /** When it was read, so the first render's dates match between server and browser. */
  fetchedAt: number
}

/**
 * The household's saved recipes, each matched against the pantry (from the hourly
 * cache, or one informationBulk call for the rest) and with its cook history.
 */
export async function getSavedRecipes(householdId: string): Promise<SavedRecipesResult> {
  const supabase = await createClient()
  const [saved, cooked, items] = await Promise.all([
    supabase
      .from("saved_recipes")
      .select("recipe_id, title, saved_by, created_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("batch_id, details, created_at")
      .eq("household_id", householdId)
      .eq("action", "cooked")
      .order("created_at", { ascending: false })
      .limit(5000),
    getPantryItems(householdId),
  ])
  if (saved.error) throw saved.error
  if (cooked.error) throw cooked.error

  const ids = saved.data.map((row) => Number(row.recipe_id))
  const { details } = isSpoonacularConfigured()
    ? await cachedRecipeDetails(householdId, ids)
    : { details: new Map<number, RecipeDetail>() }
  const history = cookHistory(cooked.data)
  const index = buildPantryIndex(items, localDateKey())

  const recipes = saved.data.map((row): SavedRecipe => {
    const id = Number(row.recipe_id)
    const detail = details.get(id)
    let match: SavedRecipe["match"] = null
    if (detail) {
      const suggestion = toSuggestion(index, { ...detail, used: [], missed: detail.ingredients })
      match = { have: suggestion.have.length, need: suggestion.need }
    }
    return {
      id,
      title: row.title,
      image: detail?.image ?? fallbackImage(id),
      readyInMinutes: detail?.readyInMinutes ?? null,
      savedAt: row.created_at,
      savedBy: row.saved_by,
      match,
      history: history.get(id) ?? null,
    }
  })
  return { recipes, unmatched: recipes.filter((recipe) => recipe.match === null).length, fetchedAt: Date.now() }
}
