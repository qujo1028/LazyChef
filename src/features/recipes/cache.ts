import "server-only"

import { createHash } from "node:crypto"

import {
  bulkCost,
  BULK_LIMIT,
  getRecipeInformationBulk,
  SpoonacularError,
  type RecipeDetail,
  type SpoonacularQuota,
} from "@/lib/spoonacular"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Below this many points left today, new searches wait for tomorrow, leaving a little for
 * adding food (parseIngredients) and opening already-found recipes.
 */
export const RESERVED_POINTS = 3

export type Usage = { used: number; left: number | null }

/** "find:" + a short, stable hash of the parts. */
export function cacheKey(kind: string, parts: readonly (string | number | null)[]): string {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("base64url").slice(0, 32)
  return `${kind}:${hash}`
}

function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

/** Today's Spoonacular usage (shared by everyone on this API key), or null if nothing's recorded. */
export async function getUsageToday(supabase?: Supabase): Promise<Usage | null> {
  const client = supabase ?? (await createClient())
  const { data, error } = await client
    .from("spoonacular_usage")
    .select("points_used, points_left")
    .eq("day", utcDay())
    .maybeSingle()
  if (error) {
    console.error("Reading Spoonacular usage failed:", error.message)
    return null
  }
  return data ? { used: Number(data.points_used), left: data.points_left === null ? null : Number(data.points_left) } : null
}

/** Records the quota headers of a response. Never throws: it's bookkeeping. */
export async function recordUsage(quota: SpoonacularQuota | null, supabase?: Supabase): Promise<void> {
  if (!quota || quota.used === null) return
  try {
    const client = supabase ?? (await createClient())
    const { error } = await client.rpc("record_spoonacular_usage", {
      p_points_used: quota.used,
      p_points_left: quota.left,
    })
    if (error) console.error("Recording Spoonacular usage failed:", error.message)
  } catch (error) {
    console.error("Recording Spoonacular usage failed:", error)
  }
}

export type Cached<T> = { value: T; savedAt: string; fromCache: boolean; usage: Usage | null }

/**
 * A household's cached Spoonacular answer for `key`, or a fresh one from `load` (then
 * saved for an hour). Before spending points, checks today's recorded usage so every
 * server instance stops short of the daily limit; throws SpoonacularError("quota") then.
 */
export async function cachedSpoonacular<T>(
  householdId: string,
  key: string,
  load: () => Promise<{ value: T; quota: SpoonacularQuota }>,
  options: { reserve?: number } = {},
): Promise<Cached<T>> {
  const supabase = await createClient()
  const now = new Date()
  const [{ data: hit, error }, usage] = await Promise.all([
    supabase
      .from("spoonacular_cache")
      .select("response, created_at")
      .eq("household_id", householdId)
      .eq("cache_key", key)
      .gt("expires_at", now.toISOString())
      .maybeSingle(),
    getUsageToday(supabase),
  ])
  if (error) console.error("Reading the recipe cache failed:", error.message)
  if (hit) return { value: hit.response as T, savedAt: hit.created_at, fromCache: true, usage }

  const reserve = options.reserve ?? RESERVED_POINTS
  if (usage?.left !== null && usage?.left !== undefined && usage.left < reserve) throw new SpoonacularError("quota")

  const { value, quota } = await load()
  await recordUsage(quota, supabase)
  const { error: saveError } = await supabase.rpc("put_spoonacular_cache", {
    p_household_id: householdId,
    p_cache_key: key,
    p_response: value as Json,
  })
  if (saveError) console.error("Saving to the recipe cache failed:", saveError.message)

  const fresh = quota.used !== null ? { used: quota.used, left: quota.left } : usage
  return { value, savedAt: new Date().toISOString(), fromCache: false, usage: fresh }
}

/** The cache key getRecipe() uses for one recipe's details. */
export function recipeInfoKey(recipeId: number): string {
  return `info:${recipeId}`
}

/**
 * Details for several recipes: whatever the household has cached, plus one
 * informationBulk call for the rest (saved per recipe, so opening one is free).
 * If today's points can't cover the call (keeping 1 for opening a recipe), or it
 * fails, the rest come back in `missing` instead of throwing.
 */
export async function cachedRecipeDetails(
  householdId: string,
  recipeIds: readonly number[],
): Promise<{ details: Map<number, RecipeDetail>; missing: number[]; usage: Usage | null }> {
  const ids = [...new Set(recipeIds)]
  const details = new Map<number, RecipeDetail>()
  if (ids.length === 0) return { details, missing: [], usage: null }

  const supabase = await createClient()
  const [{ data: hits, error }, usage] = await Promise.all([
    supabase
      .from("spoonacular_cache")
      .select("cache_key, response")
      .eq("household_id", householdId)
      .in("cache_key", ids.map(recipeInfoKey))
      .gt("expires_at", new Date().toISOString()),
    getUsageToday(supabase),
  ])
  if (error) console.error("Reading the recipe cache failed:", error.message)
  for (const hit of hits ?? []) {
    const recipe = hit.response as RecipeDetail | null
    if (recipe && typeof recipe.id === "number") details.set(recipe.id, recipe)
  }

  const toFetch = ids.filter((id) => !details.has(id)).slice(0, BULK_LIMIT)
  const left = usage?.left
  if (toFetch.length === 0 || (left !== null && left !== undefined && left < bulkCost(toFetch.length) + 1)) {
    return { details, missing: ids.filter((id) => !details.has(id)), usage }
  }

  try {
    const { recipes, quota } = await getRecipeInformationBulk(toFetch)
    await recordUsage(quota, supabase)
    await Promise.all(
      recipes.map(async (recipe) => {
        details.set(recipe.id, recipe)
        const { error: saveError } = await supabase.rpc("put_spoonacular_cache", {
          p_household_id: householdId,
          p_cache_key: recipeInfoKey(recipe.id),
          p_response: recipe as unknown as Json,
        })
        if (saveError) console.error("Saving to the recipe cache failed:", saveError.message)
      }),
    )
    const fresh = quota.used !== null ? { used: quota.used, left: quota.left } : usage
    return { details, missing: ids.filter((id) => !details.has(id)), usage: fresh }
  } catch (error) {
    console.warn("[spoonacular] saved recipes failed:", error instanceof SpoonacularError ? error.code : error)
    return { details, missing: ids.filter((id) => !details.has(id)), usage }
  }
}
