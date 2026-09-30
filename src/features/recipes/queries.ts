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
  type RecipeIngredient,
  type RecipeSummary,
} from "@/lib/spoonacular"
import { RateLimitedError, requireRateLimit } from "@/lib/rate-limit"
import { createClient } from "@/lib/supabase/server"

import { cachedRecipeDetails, cachedSpoonacular, getCacheStore, getUsageToday } from "./cache"
import { recipeCacheKey, restingUntil, suggestionsCacheKey, type Usage } from "./cache-core"
import type { CookLine } from "./cook"
import { planCook } from "./cook-plan"
import { hasFilters, type RecipeFilters } from "./filters"
import { findLocalCandidates, getHouseholdRecipes, getLocalCards, getLocalRecipe, type LocalRecipe } from "./local"
import {
  localSuggestion,
  mergeLists,
  mergeSuggestions,
  rankLocal,
  rankSearch,
  rankSpoonacularSearch,
  wantsSpoonacular,
} from "./local-match"
import {
  buildPantryIndex,
  checkIngredients,
  pantrySearchNames,
  sortSuggestions,
  spoonacularMatchable,
  toSuggestion,
  type CheckedIngredient,
  type Suggestion,
  type Suggestions,
} from "./match"
import type { RecipeRef, RecipeSource } from "./ref"
import { cookHistory, type SavedRecipe } from "./saved"

/**
 * How many recipes to ask for. findByIngredients is cheap (40 → 1.4 points). complexSearch
 * with its add-ons costs 0.06 per result, so it asks for fewer (20 → 2.2 points).
 */
const FIND_SIZE = 40
const SEARCH_SIZE = 20

export type SpoonacularProblem = { code: SpoonacularError["code"]; message: string }

/** Spoonacular's share of the ideas: skipped when local results were enough. */
export type SpoonacularPart =
  | { status: "skipped" }
  | { status: "no-key" }
  /** Today's points are used up (or nearly): searches wait for midnight UTC. */
  | { status: "resting"; resetsAt: string; usage: Usage | null }
  | { status: "error"; problem: SpoonacularProblem }
  | { status: "ok"; savedAt: string; usage: Usage | null; count: number }

export type IdeasResult =
  | { status: "empty-pantry" }
  | ({ status: "ok"; mode: "ideas"; localCount: number; spoonacular: SpoonacularPart } & Suggestions)
  | { status: "ok"; mode: "search"; results: Suggestion[]; localCount: number; spoonacular: SpoonacularPart }

function problem(error: unknown, context: string): SpoonacularProblem {
  if (error instanceof RateLimitedError) return { code: "rate_limit", message: error.message }
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
 * Spoonacular's recipes for the pantry's names plus the filters, cached for an hour and
 * shared by every household. Spends points only on a cache miss, within the daily guard.
 */
async function spoonacularRecipes(
  names: string[],
  filters: RecipeFilters,
): Promise<{ part: SpoonacularPart; recipes: RecipeSummary[] }> {
  if (!isSpoonacularConfigured()) return { part: { status: "no-key" }, recipes: [] }
  const filtered = hasFilters(filters)
  const key = suggestionsCacheKey(names, filters)
  try {
    const result = await cachedSpoonacular<RecipeSummary[]>(
      getCacheStore(),
      key,
      async () => {
        const { recipes, quota } = filtered
          ? await searchRecipes({
              ingredients: names,
              type: filters.type,
              maxReadyTime: filters.maxTime,
              query: filters.query,
              number: SEARCH_SIZE,
            })
          : await findRecipesByIngredients(names, FIND_SIZE)
        return { value: recipes, quota }
      },
      { cost: filtered ? searchCost(SEARCH_SIZE) : findCost(FIND_SIZE), beforeSpend: () => requireRateLimit("recipe_search") },
    )
    const recipes = await withCachedTimes(result.value)
    return { part: { status: "ok", savedAt: result.savedAt, usage: result.usage, count: recipes.length }, recipes }
  } catch (error) {
    if (isQuota(error)) return { part: { status: "resting", resetsAt: restingUntil(), usage: await getUsageToday() }, recipes: [] }
    return { part: { status: "error", problem: problem(error, "recipe search") }, recipes: [] }
  }
}

/**
 * "Make now" and "Almost there" (or search results) for the household's pantry. Our own
 * library comes first and is free; Spoonacular is only asked when that gives fewer than
 * LOCAL_ENOUGH ideas, or for "Show more ideas" (`more`).
 */
export async function getRecipeIdeas(householdId: string, filters: RecipeFilters, more = false): Promise<IdeasResult> {
  const items = await getPantryItems(householdId)
  const today = localDateKey()
  const names = pantrySearchNames(items, today)
  const search = filters.query !== null
  if (names.length === 0 && !search) return { status: "empty-pantry" }

  const index = buildPantryIndex(items, today)
  let candidates: Awaited<ReturnType<typeof findLocalCandidates>> = []
  try {
    candidates = await findLocalCandidates(householdId, items, filters)
  } catch (error) {
    // Before the migration is applied (or on a hiccup), fall back to Spoonacular alone.
    console.error("Matching local recipes failed:", error instanceof Error ? error.message : error)
  }

  if (search) {
    const local = rankSearch(index, candidates)
    const { part, recipes } = wantsSpoonacular(local.length, more)
      ? await spoonacularRecipes(names, filters)
      : { part: { status: "skipped" } as const, recipes: [] }
    return {
      status: "ok",
      mode: "search",
      results: mergeLists(local, rankSpoonacularSearch(index, recipes)),
      localCount: local.length,
      spoonacular: part,
    }
  }

  const local = rankLocal(index, candidates)
  const localCount = local.makeNow.length + local.almostThere.length
  if (!wantsSpoonacular(localCount, more)) {
    return { status: "ok", mode: "ideas", ...local, localCount, spoonacular: { status: "skipped" } }
  }
  const { part, recipes } = await spoonacularRecipes(names, filters)
  const extra = part.status === "ok" ? sortSuggestions(index, recipes) : null
  return { status: "ok", mode: "ideas", ...mergeSuggestions(local, extra), localCount, spoonacular: part }
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
    { cost: recipeInformationCost(), reserve: 1, beforeSpend: () => requireRateLimit("recipe_open") },
  )
})

/** Any recipe, whichever source, for its page. */
export type RecipeView = {
  /** What its URL and actions use (see ref.ts). */
  ref: string
  source: RecipeSource
  spoonacularId: number | null
  localId: string | null
  /** Set for a household's own recipe (members can edit it). */
  householdId: string | null
  title: string
  image: string | null
  readyInMinutes: number | null
  servings: number | null
  cuisine: string | null
  sourceUrl: string | null
  sourceName: string | null
  /** TheMealDB's page for an imported recipe. */
  creditUrl: string | null
  steps: string[]
  ingredients: RecipeIngredient[]
  /** Per ingredient line: "to serve" and the like (local recipes only). */
  optional: boolean[]
}

export type RecipeDetailResult =
  | { status: "no-key" }
  | { status: "not-found" }
  | { status: "resting"; resetsAt: string }
  | { status: "error"; problem: SpoonacularProblem }
  | {
      status: "ok"
      recipe: RecipeView
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

function spoonacularView(recipe: RecipeDetail): RecipeView {
  return {
    ref: String(recipe.id),
    source: "spoonacular",
    spoonacularId: recipe.id,
    localId: null,
    householdId: null,
    title: recipe.title,
    image: recipe.image,
    readyInMinutes: recipe.readyInMinutes,
    servings: recipe.servings,
    cuisine: null,
    sourceUrl: recipe.sourceUrl,
    sourceName: recipe.sourceName,
    creditUrl: null,
    steps: recipe.steps,
    ingredients: recipe.ingredients,
    optional: recipe.ingredients.map(() => false),
  }
}

function localView(recipe: LocalRecipe): RecipeView {
  return {
    ref: recipe.id,
    source: recipe.source,
    spoonacularId: null,
    localId: recipe.id,
    householdId: recipe.householdId,
    title: recipe.title,
    image: recipe.image,
    readyInMinutes: recipe.readyInMinutes,
    servings: recipe.servings,
    cuisine: recipe.cuisine,
    sourceUrl: recipe.sourceUrl,
    sourceName: recipe.sourceUrl ? hostName(recipe.sourceUrl) : null,
    creditUrl: recipe.creditUrl,
    steps: recipe.steps,
    ingredients: recipe.ingredients,
    optional: recipe.optional,
  }
}

function hostName(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/**
 * A recipe for an action (add to list, cook): ours straight from the database, Spoonacular's
 * from the shared cache. Null when it doesn't exist or isn't visible to this household.
 */
export async function loadRecipe(ref: RecipeRef, householdId: string): Promise<RecipeView | null> {
  if (ref.kind === "local") {
    const recipe = await getLocalRecipe(ref.id, householdId)
    return recipe ? localView(recipe) : null
  }
  return spoonacularView((await getRecipe(ref.id)).value)
}

export async function getRecipeDetail(householdId: string, ref: RecipeRef): Promise<RecipeDetailResult> {
  if (ref.kind === "spoonacular" && !isSpoonacularConfigured()) return { status: "no-key" }
  try {
    const [recipe, items, lines] = await Promise.all([
      loadRecipe(ref, householdId),
      getPantryItems(householdId),
      getOpenListLines(householdId),
    ])
    if (!recipe) return { status: "not-found" }
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
    if (ref.kind === "local") throw error
    return { status: "error", problem: problem(error, "recipe details") }
  }
}

/** Refs of the household's saved recipes (Spoonacular ids and our uuids), for the hearts. */
export const getSavedIds = cache(async (householdId: string): Promise<Set<string>> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("saved_recipes")
    .select("recipe_id, local_recipe_id")
    .eq("household_id", householdId)
  if (error) throw error
  return new Set(data.flatMap((row) => (row.local_recipe_id ? [row.local_recipe_id] : row.recipe_id ? [String(row.recipe_id)] : [])))
})

/** Where Spoonacular keeps a recipe's photo, for saved recipes saved before we kept the image. */
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
 * The household's saved recipes, each matched against the pantry, with its cook history.
 * Ours are matched straight from the database; Spoonacular's from the hourly cache, or
 * one informationBulk call for the rest.
 */
export async function getSavedRecipes(householdId: string): Promise<SavedRecipesResult> {
  const supabase = await createClient()
  const [saved, cooked, items] = await Promise.all([
    supabase
      .from("saved_recipes")
      .select("recipe_id, local_recipe_id, title, image_url, saved_by, created_at")
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

  const spoonIds = saved.data.flatMap((row) => (row.recipe_id !== null ? [Number(row.recipe_id)] : []))
  const localIds = saved.data.flatMap((row) => (row.local_recipe_id ? [row.local_recipe_id] : []))
  const [{ details }, localCards] = await Promise.all([
    isSpoonacularConfigured() && spoonIds.length > 0
      ? cachedRecipeDetails(spoonIds)
      : Promise.resolve({ details: new Map<number, RecipeDetail>() }),
    getLocalCards(localIds, householdId),
  ])
  const history = cookHistory(cooked.data)
  const index = buildPantryIndex(items, localDateKey())
  const locals = new Map(localCards.map((card) => [card.id, card]))

  const recipes = saved.data.flatMap((row): SavedRecipe[] => {
    const base = { savedAt: row.created_at, savedBy: row.saved_by }
    if (row.local_recipe_id) {
      const card = locals.get(row.local_recipe_id)
      if (!card) return []
      const suggestion = localSuggestion(index, card)
      return [
        {
          ...base,
          id: card.id,
          source: card.source,
          title: card.title,
          image: card.image,
          readyInMinutes: card.readyInMinutes,
          match: { have: suggestion.have.length, need: suggestion.need },
          history: history.get(card.id) ?? null,
        },
      ]
    }
    const id = Number(row.recipe_id)
    const detail = details.get(id)
    let match: SavedRecipe["match"] = null
    if (detail) {
      const suggestion = toSuggestion(index, spoonacularMatchable({ ...detail, used: [], missed: detail.ingredients }))
      match = { have: suggestion.have.length, need: suggestion.need }
    }
    return [
      {
        ...base,
        id: String(id),
        source: "spoonacular",
        title: row.title,
        image: row.image_url ?? detail?.image ?? fallbackImage(id),
        readyInMinutes: detail?.readyInMinutes ?? null,
        match,
        history: history.get(String(id)) ?? null,
      },
    ]
  })
  return { recipes, unmatched: recipes.filter((recipe) => recipe.match === null).length, fetchedAt: Date.now() }
}

/** The household's own recipes (the "Ours" tab), matched against the pantry. */
export async function getOurRecipes(householdId: string): Promise<{ recipes: Suggestion[] }> {
  const [cards, items] = await Promise.all([getHouseholdRecipes(householdId), getPantryItems(householdId)])
  const index = buildPantryIndex(items, localDateKey())
  return { recipes: cards.map((card) => localSuggestion(index, card)) }
}
