import "server-only"

import {
  BULK_LIMIT,
  bulkCost,
  getRecipeInformationBulk,
  SpoonacularError,
  type RecipeDetail,
  type SpoonacularQuota,
} from "@/lib/spoonacular"
import { utcDay } from "@/lib/spoonacular/cost"
import { getServerDb } from "@/lib/spoonacular/server-db"
import { takeRateLimit } from "@/lib/rate-limit"
import type { Json } from "@/types/database"

import { isResting, memoryStore, recipeCacheKey, type CacheStore, type Usage } from "./cache-core"

export { cachedSpoonacular, RESERVED_POINTS, type Cached, type Usage } from "./cache-core"

// One cache for every household, in Supabase, read and written only by the server with
// SUPABASE_SECRET_KEY. Without that key (local dev), an in-memory cache per instance.

type Db = NonNullable<ReturnType<typeof getServerDb>>

function supabaseStore(db: Db): CacheStore {
  return {
    async get(key) {
      const { data, error } = await db
        .from("spoonacular_cache")
        .select("response, created_at")
        .eq("cache_key", key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
      if (error) console.error("Reading the Spoonacular cache failed:", error.message)
      return data ? { value: data.response, savedAt: data.created_at } : null
    },
    async getMany(keys) {
      const found = new Map<string, unknown>()
      if (keys.length === 0) return found
      const { data, error } = await db
        .from("spoonacular_cache")
        .select("cache_key, response")
        .in("cache_key", [...keys])
        .gt("expires_at", new Date().toISOString())
      if (error) console.error("Reading the Spoonacular cache failed:", error.message)
      for (const row of data ?? []) found.set(row.cache_key, row.response)
      return found
    },
    async put(key, value) {
      const { error } = await db.rpc("put_spoonacular_cache", { p_cache_key: key, p_response: value as Json })
      if (error) console.error("Saving to the Spoonacular cache failed:", error.message)
    },
    async usage() {
      const { data, error } = await db
        .from("spoonacular_usage")
        .select("points_used, points_left, exhausted_at")
        .eq("day", utcDay())
        .maybeSingle()
      if (error) {
        console.error("Reading Spoonacular usage failed:", error.message)
        return null
      }
      return data ? toUsage(data.points_used, data.points_left, data.exhausted_at !== null) : null
    },
    async record({ quota, estimate, exhausted }) {
      if (!exhausted && quota?.used == null && !estimate) return null
      const { data, error } = await db.rpc("record_spoonacular_usage", {
        p_points_used: quota?.used ?? null,
        p_points_left: quota?.left ?? null,
        p_estimated_cost: quota?.used == null ? (estimate ?? null) : null,
        p_exhausted: exhausted ?? false,
      })
      if (error) {
        console.error("Recording Spoonacular usage failed:", error.message)
        return null
      }
      const row = data?.[0]
      return row ? toUsage(row.points_used, row.points_left, row.exhausted) : null
    },
  }
}

function toUsage(used: number, left: number | null, exhausted: boolean): Usage {
  return { used: Number(used), left: left === null ? null : Number(left), exhausted }
}

/**
 * The shared store with this instance's memory behind it, so a database hiccup (or a
 * deploy that lands before its migration) doesn't turn every visit into a paid search.
 */
function layered(primary: CacheStore, backup: CacheStore): CacheStore {
  return {
    async get(key) {
      return (await primary.get(key)) ?? (await backup.get(key))
    },
    async getMany(keys) {
      const found = await primary.getMany(keys)
      const rest = keys.filter((key) => !found.has(key))
      for (const [key, value] of await backup.getMany(rest)) found.set(key, value)
      return found
    },
    async put(key, value) {
      await Promise.all([primary.put(key, value), backup.put(key, value)])
    },
    async usage() {
      return (await primary.usage()) ?? (await backup.usage())
    },
    async record(update) {
      const [shared, local] = await Promise.all([primary.record(update), backup.record(update)])
      return shared ?? local
    },
  }
}

let memory: CacheStore | null = null
let warned = false

export function getCacheStore(): CacheStore {
  memory ??= memoryStore()
  const db = getServerDb()
  if (db) return layered(supabaseStore(db), memory)
  if (!warned && process.env.NODE_ENV === "production") {
    console.warn("[spoonacular] SUPABASE_SECRET_KEY isn't set: using a per-instance cache instead of the shared one.")
    warned = true
  }
  return memory
}

/** Today's shared Spoonacular usage, or null if nothing's recorded yet. */
export function getUsageToday(): Promise<Usage | null> {
  return getCacheStore().usage()
}

/** Records the quota headers of a response (the pantry's parseIngredients uses this). Never throws. */
export async function recordUsage(quota: SpoonacularQuota | null): Promise<void> {
  if (!quota || quota.used === null) return
  try {
    await getCacheStore().record({ quota })
  } catch (error) {
    console.error("Recording Spoonacular usage failed:", error)
  }
}

/**
 * Details for several recipes (the Saved tab): whatever's in the shared cache, plus one
 * informationBulk call for the rest, saved per recipe so opening one is free. If today's
 * points can't cover the call (keeping 1 for opening a recipe), or it fails, the rest
 * come back in `missing` instead of throwing.
 */
export async function cachedRecipeDetails(
  recipeIds: readonly number[],
): Promise<{ details: Map<number, RecipeDetail>; missing: number[]; usage: Usage | null }> {
  const ids = [...new Set(recipeIds)]
  const details = new Map<number, RecipeDetail>()
  if (ids.length === 0) return { details, missing: [], usage: null }

  const store = getCacheStore()
  const [hits, usage] = await Promise.all([store.getMany(ids.map(recipeCacheKey)), store.usage()])
  for (const value of hits.values()) {
    const recipe = value as RecipeDetail | null
    if (recipe && typeof recipe.id === "number") details.set(recipe.id, recipe)
  }
  const missing = () => ids.filter((id) => !details.has(id))

  const toFetch = missing().slice(0, BULK_LIMIT)
  const cost = bulkCost(toFetch.length)
  if (toFetch.length === 0 || isResting(usage, cost, 1)) return { details, missing: missing(), usage }
  if (!(await takeRateLimit("recipe_open"))) return { details, missing: missing(), usage }

  try {
    const { recipes, quota } = await getRecipeInformationBulk(toFetch)
    const [fresh] = await Promise.all([
      store.record({ quota, estimate: cost }),
      ...recipes.map((recipe) => {
        details.set(recipe.id, recipe)
        return store.put(recipeCacheKey(recipe.id), recipe)
      }),
    ])
    return { details, missing: missing(), usage: fresh ?? usage }
  } catch (error) {
    if (error instanceof SpoonacularError && error.code === "quota") {
      await store.record({ quota: error.quota, exhausted: true })
    }
    console.warn("[spoonacular] saved recipes failed:", error instanceof SpoonacularError ? error.code : error)
    return { details, missing: missing(), usage }
  }
}
