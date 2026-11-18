// Supabase wiring for the recipes Edge Function (Deno only).
//
// Two clients, never mixed up:
// - the caller's: the anon key plus their access token, so RLS applies. It verifies the token,
//   checks household membership and takes their rate limit.
// - the service role's: ONLY for the server-only spoonacular_cache and spoonacular_usage tables
//   (as the web does with getServerDb). Never used for household data.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { CacheStore, Usage } from "./cache.ts"
import type { Caller, RateLimitBucket } from "./handler.ts"
import { utcDay } from "../_shared/core/cost.ts"

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const

/** A client acting as the person with this access token (RLS applies). */
export function callerClient(url: string, anonKey: string, token: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

/** Verifies the token with Supabase Auth and returns the caller, or null for a bad or expired token. */
export async function authenticate(url: string, anonKey: string, token: string): Promise<Caller | null> {
  const client = callerClient(url, anonKey, token)
  const { data, error } = await client.auth.getUser(token)
  if (error) {
    // 4xx: the token isn't a valid session. Anything else: we can't tell, so fail closed.
    const status = (error as { status?: number }).status
    if (status !== undefined && status >= 400 && status < 500) return null
    throw new Error("Auth check failed")
  }
  const userId = data.user?.id
  if (!userId) return null

  return {
    async isMember(householdId) {
      const { data: row, error: memberError } = await client
        .from("household_members")
        .select("household_id")
        .eq("household_id", householdId)
        .eq("user_id", userId)
        .maybeSingle()
      if (memberError) throw new Error("Membership check failed")
      return row !== null
    },
    async takeRateLimit(bucket: RateLimitBucket) {
      const { data: allowed, error: limitError } = await client.rpc("take_rate_limit", { p_bucket: bucket })
      if (limitError) throw new Error("Rate limit check failed")
      // Only an explicit true counts: take_rate_limit returns null for a bucket it doesn't allow.
      return allowed === true
    },
  }
}

/** The service role client, for the shared cache and usage only. */
export function serviceClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, { auth: NO_SESSION })
}

function toUsage(used: number, left: number | null, exhausted: boolean): Usage {
  return { used: Number(used), left: left === null ? null : Number(left), exhausted }
}

/** The shared Spoonacular cache (spoonacular_cache, put_spoonacular_cache) and usage (record_spoonacular_usage). */
export function supabaseStore(db: SupabaseClient, log: (message: string) => void): CacheStore {
  return {
    async get(key) {
      const { data, error } = await db
        .from("spoonacular_cache")
        .select("response, created_at")
        .eq("cache_key", key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
      if (error) log(`[recipes] reading the cache failed: ${error.code ?? "error"}`)
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
      if (error) log(`[recipes] reading the cache failed: ${error.code ?? "error"}`)
      for (const row of data ?? []) found.set(row.cache_key, row.response)
      return found
    },
    async put(key, value) {
      const { error } = await db.rpc("put_spoonacular_cache", { p_cache_key: key, p_response: value })
      if (error) log(`[recipes] saving to the cache failed: ${error.code ?? "error"}`)
    },
    async usage() {
      const { data, error } = await db
        .from("spoonacular_usage")
        .select("points_used, points_left, exhausted_at")
        .eq("day", utcDay())
        .maybeSingle()
      if (error) {
        log(`[recipes] reading usage failed: ${error.code ?? "error"}`)
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
        log(`[recipes] recording usage failed: ${error.code ?? "error"}`)
        return null
      }
      const row = Array.isArray(data) ? data[0] : null
      return row ? toUsage(row.points_used, row.points_left, row.exhausted) : null
    },
  }
}
