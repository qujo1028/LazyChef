import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { RecipeIngredient } from "@/lib/spoonacular/recipe-shapes"

import { basicKeys, LOCAL_CANDIDATES, pantryMatchKeys, toRecipeIngredients, type LocalIngredient, type LocalRecipeCard } from "./local-match"
import type { PantryRow } from "./match"
import type { RecipeFilters } from "./filters"
import { mealDbUrl } from "./ref"

// Our own recipe library (TheMealDB imports + household recipes), read as the signed-in
// user, so RLS decides what's visible. Nothing here costs Spoonacular points.

type Db = Awaited<ReturnType<typeof createClient>>

export const PHOTO_BUCKET = "recipe-photos"

/** Signed photo links last an hour; pages render per request, so that's plenty. */
const PHOTO_URL_SECONDS = 60 * 60

/** Recipes per ingredient query: keeps each response under PostgREST's row cap. */
const CHUNK = 25

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Signed links for household photos, by storage path. Missing ones are just left out. */
export async function signedPhotoUrls(supabase: Db, paths: readonly (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  const urls = new Map<string, string>()
  if (unique.length === 0) return urls
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, PHOTO_URL_SECONDS)
  if (error) {
    console.error("Signing recipe photos failed:", error.message)
    return urls
  }
  for (const row of data ?? []) if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl)
  return urls
}

type RecipeRow = {
  id: string
  source: "themealdb" | "user"
  title: string
  image_url: string | null
  photo_path: string | null
  ready_in_minutes: number | null
}

async function ingredientsFor(supabase: Db, ids: readonly string[]): Promise<Map<string, LocalIngredient[]>> {
  const byRecipe = new Map<string, LocalIngredient[]>()
  const results = await Promise.all(
    chunks(ids, CHUNK).map((part) =>
      supabase
        .from("recipe_ingredients")
        .select("recipe_id, position, original, name, quantity, unit, ingredient_id, optional")
        .in("recipe_id", part)
        .order("recipe_id")
        .order("position"),
    ),
  )
  for (const { data, error } of results) {
    if (error) throw error
    for (const row of data) {
      const list = byRecipe.get(row.recipe_id) ?? []
      list.push({
        original: row.original,
        name: row.name,
        quantity: row.quantity === null ? null : Number(row.quantity),
        unit: row.unit,
        ingredient_id: row.ingredient_id,
        optional: row.optional,
      })
      byRecipe.set(row.recipe_id, list)
    }
  }
  return byRecipe
}

/** Cards (with ingredients and photo links) for these recipes, in the order given. */
export async function getLocalCards(ids: readonly string[], householdId: string): Promise<LocalRecipeCard[]> {
  if (ids.length === 0) return []
  const supabase = await createClient()
  const recipeResults = await Promise.all(
    chunks(ids, 100).map((part) =>
      supabase
        .from("recipes")
        .select("id, source, title, image_url, photo_path, ready_in_minutes, household_id")
        .in("id", part)
        // Only the shared library and this household (someone in two households sees the active one).
        .or(`household_id.is.null,household_id.eq.${householdId}`),
    ),
  )
  const rows: RecipeRow[] = []
  for (const { data, error } of recipeResults) {
    if (error) throw error
    rows.push(...data)
  }
  const [ingredients, photos] = await Promise.all([
    ingredientsFor(
      supabase,
      rows.map((row) => row.id),
    ),
    signedPhotoUrls(
      supabase,
      rows.map((row) => row.photo_path),
    ),
  ])
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    if (!row) return []
    return {
      id: row.id,
      source: row.source,
      title: row.title,
      image: (row.photo_path ? photos.get(row.photo_path) : null) ?? row.image_url,
      readyInMinutes: row.ready_in_minutes,
      ingredients: ingredients.get(row.id) ?? [],
    }
  })
}

/**
 * The local recipes worth a closer look for this pantry: the database counts covered and
 * missing lines for every recipe and hands back the best ones. With a search, every
 * recipe whose title has the words comes back, however much is missing.
 */
export async function findLocalCandidates(
  householdId: string,
  items: readonly PantryRow[],
  filters: RecipeFilters,
): Promise<LocalRecipeCard[]> {
  const supabase = await createClient()
  const pantry = pantryMatchKeys(items)
  const basics = basicKeys()
  const search = filters.query !== null
  const { data, error } = await supabase.rpc("match_local_recipes", {
    p_household_id: householdId,
    p_ingredient_ids: pantry.ids,
    p_name_keys: pantry.keys,
    p_ignore_ids: basics.ids,
    p_ignore_keys: basics.keys,
    p_meal_type: filters.type,
    p_max_minutes: filters.maxTime,
    p_query: filters.query,
    // The database's count is by exact keys; the exact check afterwards can only find
    // more of the pantry, so leave a little room.
    p_max_missing: search ? 100 : 5,
    p_limit: search ? 60 : LOCAL_CANDIDATES,
  })
  if (error) throw error
  return getLocalCards(
    data.map((row) => row.recipe_id),
    householdId,
  )
}

/** One of our recipes, for its page. */
export type LocalRecipe = {
  id: string
  source: "themealdb" | "user"
  householdId: string | null
  title: string
  summary: string | null
  cuisine: string | null
  mealTypes: string[]
  readyInMinutes: number | null
  servings: number | null
  steps: string[]
  image: string | null
  photoPath: string | null
  sourceUrl: string | null
  /** TheMealDB's page for an imported recipe (the credit links there). */
  creditUrl: string | null
  ingredients: RecipeIngredient[]
  /** Per ingredient line: "to serve" and the like. */
  optional: boolean[]
  lines: LocalIngredient[]
  createdBy: string | null
}

/** Null when it doesn't exist or isn't the shared library's or this household's. */
export async function getLocalRecipe(id: string, householdId: string): Promise<LocalRecipe | null> {
  const supabase = await createClient()
  const [{ data: row, error }, lines] = await Promise.all([
    supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .or(`household_id.is.null,household_id.eq.${householdId}`)
      .maybeSingle(),
    ingredientsFor(supabase, [id]),
  ])
  if (error) throw error
  if (!row) return null
  const photos = await signedPhotoUrls(supabase, [row.photo_path])
  const ingredients = lines.get(id) ?? []
  return {
    id: row.id,
    source: row.source,
    householdId: row.household_id,
    title: row.title,
    summary: row.summary,
    cuisine: row.cuisine,
    mealTypes: row.meal_types,
    readyInMinutes: row.ready_in_minutes,
    servings: row.servings,
    steps: row.instructions,
    image: (row.photo_path ? photos.get(row.photo_path) : null) ?? row.image_url,
    photoPath: row.photo_path,
    sourceUrl: row.source_url,
    creditUrl: row.source === "themealdb" && row.source_id ? mealDbUrl(row.source_id) : null,
    ingredients: toRecipeIngredients(ingredients),
    optional: ingredients.map((line) => line.optional),
    lines: ingredients,
    createdBy: row.created_by,
  }
}

/** The household's own recipes, newest first (the "Ours" tab). */
export async function getHouseholdRecipes(householdId: string): Promise<LocalRecipeCard[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw error
  return getLocalCards(
    data.map((row) => row.id),
    householdId,
  )
}
