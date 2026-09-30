// The shared Spoonacular cache and daily points guard, with the storage injected so it
// can be tested without a database. cache.ts wires it to Supabase (server only).
import { createHash } from "node:crypto"

import { nextQuotaReset } from "@/lib/spoonacular/cost"
import { SpoonacularError, type SpoonacularQuota } from "@/lib/spoonacular/client"
import { normalizeIngredientName } from "@/lib/ingredients/catalog"

import type { RecipeFilters } from "./filters"

/** Spoonacular's terms: keep responses for at most an hour. */
export const CACHE_TTL_MS = 60 * 60 * 1000

/**
 * Below this many points left today, new searches wait for tomorrow, leaving a little for
 * adding food (parseIngredients) and opening recipes.
 */
export const RESERVED_POINTS = 3

/** Today's points, shared by everyone on the API key. `left` is null until a response says. */
export type Usage = { used: number; left: number | null; exhausted: boolean }

export type UsageUpdate = {
  quota: SpoonacularQuota | null
  /** Our estimate of the request's cost, used when the quota headers are missing. */
  estimate?: number | null
  /** Spoonacular said 402: nothing left until midnight UTC. */
  exhausted?: boolean
}

export interface CacheStore {
  get(key: string): Promise<{ value: unknown; savedAt: string } | null>
  /** Several at once, for filling in details that are already cached (costs nothing). */
  getMany(keys: readonly string[]): Promise<Map<string, unknown>>
  put(key: string, value: unknown): Promise<void>
  usage(): Promise<Usage | null>
  record(update: UsageUpdate): Promise<Usage | null>
}

/** "find:" + a short, stable hash of the parts. */
export function cacheKey(kind: string, parts: readonly (string | number | null)[]): string {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("base64url").slice(0, 32)
  return `${kind}:${hash}`
}

/**
 * The cache key for a pantry search: the sorted, de-duplicated normalized names plus the
 * filters. Order and spelling ("Eggs" vs "egg") don't matter, so a new expiry date or a
 * re-sort doesn't cost a search, and two households with the same food share results.
 */
export function suggestionsCacheKey(names: readonly string[], filters: RecipeFilters): string {
  const keys = [...new Set(names.map(normalizeIngredientName).filter(Boolean))].sort()
  const filtered = filters.type !== null || filters.maxTime !== null
  return filtered
    ? cacheKey("search", [...keys, `type=${filters.type ?? ""}`, `time=${filters.maxTime ?? ""}`])
    : cacheKey("find", keys)
}

export function recipeCacheKey(recipeId: number): string {
  return `info:${recipeId}`
}

/** Whether a call costing `cost` has to wait for tomorrow. */
export function isResting(usage: Usage | null, cost: number, reserve = RESERVED_POINTS): boolean {
  if (!usage) return false
  if (usage.exhausted) return true
  return usage.left !== null && usage.left - cost < reserve
}

export type Cached<T> = { value: T; savedAt: string; fromCache: boolean; usage: Usage | null }

/**
 * The cached answer for `key`, or a fresh one from `load` (then kept for an hour). Before
 * spending points, checks today's recorded usage so every server instance stops short of
 * the daily limit; throws SpoonacularError("quota") then, and after a 402.
 */
export async function cachedSpoonacular<T>(
  store: CacheStore,
  key: string,
  load: () => Promise<{ value: T; quota: SpoonacularQuota | null }>,
  { cost, reserve = RESERVED_POINTS, now = () => new Date() }: { cost: number; reserve?: number; now?: () => Date },
): Promise<Cached<T>> {
  const [hit, usage] = await Promise.all([store.get(key), store.usage()])
  if (hit) return { value: hit.value as T, savedAt: hit.savedAt, fromCache: true, usage }
  if (isResting(usage, cost, reserve)) throw new SpoonacularError("quota")

  let loaded: { value: T; quota: SpoonacularQuota | null }
  try {
    loaded = await load()
  } catch (error) {
    if (error instanceof SpoonacularError && error.code === "quota") {
      await store.record({ quota: error.quota, exhausted: true })
    }
    throw error
  }
  const [fresh] = await Promise.all([store.record({ quota: loaded.quota, estimate: cost }), store.put(key, loaded.value)])
  return { value: loaded.value, savedAt: now().toISOString(), fromCache: false, usage: fresh ?? usage }
}

/** In-memory store for when SUPABASE_SECRET_KEY isn't set (local dev, tests). Per server instance. */
export function memoryStore(now: () => number = Date.now): CacheStore {
  const entries = new Map<string, { value: unknown; saved: number }>()
  let day: { key: string; usage: Usage } | null = null
  const today = () => new Date(now()).toISOString().slice(0, 10)
  const fresh = (key: string) => {
    const entry = entries.get(key)
    if (!entry) return null
    if (entry.saved + CACHE_TTL_MS <= now()) {
      entries.delete(key)
      return null
    }
    return entry
  }
  const current = () => (day?.key === today() ? day.usage : null)

  return {
    async get(key) {
      const entry = fresh(key)
      return entry ? { value: entry.value, savedAt: new Date(entry.saved).toISOString() } : null
    },
    async getMany(keys) {
      const found = new Map<string, unknown>()
      for (const key of keys) {
        const entry = fresh(key)
        if (entry) found.set(key, entry.value)
      }
      return found
    },
    async put(key, value) {
      for (const k of [...entries.keys()]) fresh(k)
      entries.set(key, { value, saved: now() })
    },
    async usage() {
      return current()
    },
    async record({ quota, estimate, exhausted }) {
      const before = current() ?? { used: 0, left: null, exhausted: false }
      const next: Usage = exhausted
        ? { used: quota?.used ?? before.used, left: 0, exhausted: true }
        : {
            used: quota?.used ?? before.used + (estimate ?? 0),
            left: before.exhausted
              ? 0
              : quota?.left ?? (before.left === null ? null : Math.max(0, before.left - (estimate ?? 0))),
            exhausted: before.exhausted,
          }
      day = { key: today(), usage: next }
      return next
    },
  }
}

/** When searches can start again. */
export function restingUntil(now: Date = new Date()): string {
  return nextQuotaReset(now).toISOString()
}
