// Supabase wiring for the ai Edge Function (Deno only).
//
// One client: the caller's (the anon key plus their access token), so RLS applies to every read
// and the RPCs see auth.uid(). There is no service role client here: everything this function
// touches (pantry, preferences, ratings, the idea cache, the allowance and the rate limit) is
// household or personal data the caller may read or write themselves.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { AllowanceRow } from "../_shared/core/ai-allowance-core.ts"
import { cookedRecipeOf } from "../_shared/core/cooked-recipe.ts"
import type { Caller } from "./handler.ts"

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const

/** PostgREST returns at most this many rows per request. */
const PAGE = 1000

/** A client acting as the person with this access token (RLS applies). */
export function callerClient(url: string, anonKey: string, token: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

/** Throws a plain error (the table or RPC name only) so nothing from the database reaches a log or the app. */
function check(error: unknown, what: string): void {
  if (error) throw new Error(`${what} failed`)
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
      check(memberError, "Membership check")
      return row !== null
    },

    async pantryItems(householdId) {
      const { data: rows, error: pantryError } = await client
        .from("pantry_items")
        .select("name, quantity, is_staple, expires_on")
        .eq("household_id", householdId)
        .order("name")
        .limit(PAGE)
      check(pantryError, "Reading the pantry")
      return (rows ?? []).map((row) => ({
        name: String(row.name ?? ""),
        quantity: row.quantity === null ? null : Number(row.quantity),
        is_staple: row.is_staple === true,
        expires_on: typeof row.expires_on === "string" ? row.expires_on : null,
      }))
    },

    async preferences() {
      const { data: row, error: prefsError } = await client
        .from("user_preferences")
        .select("diet, allergies")
        .eq("user_id", userId)
        .maybeSingle()
      check(prefsError, "Reading preferences")
      return row ? { diet: row.diet, allergies: row.allergies } : null
    },

    async ratings(householdId) {
      const { data: rows, error: ratingsError } = await client
        .from("recipe_ratings")
        .select("recipe_ref, rating, updated_at")
        .eq("household_id", householdId)
        .limit(PAGE)
      check(ratingsError, "Reading ratings")
      return (rows ?? []).map((row) => ({ recipe_ref: String(row.recipe_ref), rating: Number(row.rating), updated_at: String(row.updated_at) }))
    },

    async recipeTitles(householdId, refs) {
      const titles = new Map<string, string>()
      const [cooked, saved, locals] = await Promise.all([
        refs.spoonacular.length > 0
          ? client
              .from("activity_log")
              .select("details")
              .eq("household_id", householdId)
              .eq("action", "cooked")
              .not("details->recipe_id", "is", null)
              .order("created_at", { ascending: false })
              .limit(PAGE)
          : Promise.resolve({ data: [], error: null }),
        refs.spoonacular.length > 0
          ? client.from("saved_recipes").select("recipe_id, title").eq("household_id", householdId).in("recipe_id", refs.spoonacular)
          : Promise.resolve({ data: [], error: null }),
        refs.local.length > 0
          ? client
              .from("recipes")
              .select("id, title")
              .in("id", refs.local)
              // Only the shared library and this household, as the web's getLocalCards.
              .or(`household_id.is.null,household_id.eq.${householdId}`)
          : Promise.resolve({ data: [], error: null }),
      ])
      check(cooked.error, "Reading cooks")
      check(saved.error, "Reading saved recipes")
      check(locals.error, "Reading recipes")
      // Same precedence as the web: cooks first (newest wins), then saved, then our own recipes.
      for (const row of (cooked.data ?? []) as { details: unknown }[]) {
        const recipe = cookedRecipeOf(row.details)
        if (recipe?.id && !titles.has(recipe.id)) titles.set(recipe.id, recipe.title)
      }
      for (const row of (saved.data ?? []) as { recipe_id: number; title: string }[]) titles.set(String(row.recipe_id), row.title)
      for (const row of (locals.data ?? []) as { id: string; title: string }[]) titles.set(row.id, row.title)
      return titles
    },

    async cachedIdeas(householdId, key) {
      const { data: row, error: cacheError } = await client
        .from("ai_idea_cache")
        .select("response")
        .eq("household_id", householdId)
        .eq("cache_key", key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
      check(cacheError, "Reading the idea cache")
      return row ? row.response : null
    },

    async saveIdeas(householdId, key, response, ttlSeconds) {
      const { error: putError } = await client.rpc("put_ai_idea_cache", {
        p_household_id: householdId,
        p_cache_key: key,
        p_response: response,
        p_ttl_seconds: ttlSeconds,
      })
      check(putError, "Saving to the idea cache")
    },

    async takeAllowance(householdId) {
      const { data: rows, error: allowanceError } = await client.rpc("take_ai_allowance", { p_household_id: householdId })
      check(allowanceError, "take_ai_allowance")
      const row = Array.isArray(rows) ? (rows[0] as AllowanceRow | undefined) : undefined
      return row && typeof row.allowed === "boolean" ? row : null
    },

    async readAllowance(householdId) {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const [status, usage] = await Promise.all([
        client.rpc("get_pro_status", { p_household_id: householdId }),
        client
          .from("ai_usage")
          .select("used_at", { count: "exact" })
          .eq("household_id", householdId)
          .gt("used_at", weekAgo)
          .order("used_at", { ascending: true })
          .limit(1),
      ])
      check(status.error, "get_pro_status")
      check(usage.error, "Reading AI usage")
      const pro = Array.isArray(status.data) ? status.data[0] : null
      // No row means not a member (or signed out): fail closed.
      if (!pro) throw new Error("get_pro_status returned no row")
      const oldest = (usage.data ?? [])[0] as { used_at?: string } | undefined
      return { pro: pro.household_pro === true, used: usage.count ?? 0, oldestUse: oldest?.used_at ?? null }
    },

    async takeAiRateLimit() {
      const { data: allowed, error: limitError } = await client.rpc("take_rate_limit", { p_bucket: "ai" })
      check(limitError, "take_rate_limit")
      // Only an explicit true counts: take_rate_limit returns null for a bucket it doesn't allow.
      return allowed === true
    },
  }
}
