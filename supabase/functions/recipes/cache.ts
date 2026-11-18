// The shared Spoonacular cache and daily points guard, ported from
// src/features/recipes/cache-core.ts with the storage injected (db.ts wires it to Supabase).
// Cache keys are byte-for-byte the web app's, so the web and the phone share one hourly cache.
// The cache holds Spoonacular's public recipe data only, never anything about a household.
import { nextQuotaReset } from "../_shared/core/cost.ts"
import type { RecipeQuota } from "../_shared/core/edge-contract.ts"
import { normalizeIngredientName } from "../_shared/core/normalize.ts"
import { findCost, SpoonacularError, type SpoonacularQuota } from "./spoonacular.ts"

/** Spoonacular's terms: keep responses for at most an hour. */
export const CACHE_TTL_MS = 60 * 60 * 1000

/** Below this many points left today, new searches wait for tomorrow (the web's RESERVED_POINTS). */
export const RESERVED_POINTS = 3

/** Opening recipes someone already found is worth more than a new search: keep only 1 back. */
export const INFO_RESERVE = 1

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
  getMany(keys: readonly string[]): Promise<Map<string, unknown>>
  put(key: string, value: unknown): Promise<void>
  usage(): Promise<Usage | null>
  record(update: UsageUpdate): Promise<Usage | null>
}

function base64url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** "find:" + a short, stable hash of the parts (the same hash as the web's node:crypto one). */
export async function cacheKey(kind: string, parts: readonly (string | number | null)[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(parts)))
  return `${kind}:${base64url(new Uint8Array(digest)).slice(0, 32)}`
}

/**
 * The cache key for a pantry search: sorted, de-duplicated normalized names plus the filters.
 * Same as the web's suggestionsCacheKey with no diet (the Edge contract has none).
 */
export function suggestionsCacheKey(
  names: readonly string[],
  filters: { type: string | null; maxTime: number | null; query: string | null },
): Promise<string> {
  const keys = [...new Set(names.map(normalizeIngredientName).filter(Boolean))].sort()
  const filtered = filters.type !== null || filters.maxTime !== null || filters.query !== null
  if (!filtered) return cacheKey("find", keys)
  const parts = [...keys, `type=${filters.type ?? ""}`, `time=${filters.maxTime ?? ""}`]
  if (filters.query !== null) parts.push(`q=${filters.query.toLowerCase().replace(/\s+/g, " ")}`)
  return cacheKey("search", parts)
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

/** The quota as the app shows it. `resting` is about new pantry searches (the cheapest kind). */
export function toRecipeQuota(usage: Usage | null, now: Date = new Date()): RecipeQuota {
  return {
    pointsLeft: usage?.left ?? null,
    resetsAt: nextQuotaReset(now).toISOString(),
    resting: isResting(usage, findCost()),
  }
}

export type Cached<T> = { value: T; fromCache: boolean; usage: Usage | null }

/**
 * The cached answer for `key`, or a fresh one from `load` (then kept for an hour). Throws
 * SpoonacularError("quota") when today's points can't cover `cost`, and after a 402.
 * `beforeSpend` runs on a miss just before spending points (the per-person rate limit).
 */
export async function cachedSpoonacular<T>(
  store: CacheStore,
  key: string,
  load: () => Promise<{ value: T; quota: SpoonacularQuota | null }>,
  { cost, reserve = RESERVED_POINTS, beforeSpend }: { cost: number; reserve?: number; beforeSpend?: () => Promise<void> },
): Promise<Cached<T>> {
  const [hit, usage] = await Promise.all([store.get(key), store.usage()])
  if (hit) return { value: hit.value as T, fromCache: true, usage }
  if (isResting(usage, cost, reserve)) throw new SpoonacularError("quota")
  await beforeSpend?.()

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
  return { value: loaded.value, fromCache: false, usage: fresh ?? usage }
}

/** In-memory store, per isolate: the backup behind the shared one (see layered()). */
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

/**
 * The shared store with this isolate's memory behind it, so a database hiccup doesn't turn
 * every request into a paid search.
 */
export function layered(primary: CacheStore, backup: CacheStore): CacheStore {
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
