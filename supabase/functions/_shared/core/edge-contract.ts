// Generated from packages/core/src/recipes/edge-contract.ts by scripts/sync-edge-shared.mjs. Edit the source, then rerun it.
// The contract between the mobile app and the `recipes` Supabase Edge Function, which does
// the app's Spoonacular calls (the key and the shared cache stay server-side). Pure types and
// constants, imported by apps/mobile and mirrored in supabase/functions/recipes.
import type { RecipeDetail, RecipeSummary } from "./recipe-shapes.ts"

export const RECIPES_FUNCTION = "recipes"

/** The Spoonacular day's quota as the app shows it ("12 searches left today, resets at 5 pm"). */
export type RecipeQuota = {
  /** Points left today, or null when unknown (no call yet today). */
  pointsLeft: number | null
  /** When the daily quota resets (midnight UTC), ISO time. */
  resetsAt: string
  /** True when new searches are paused until the reset (out of points, or under the reserve). */
  resting: boolean
}

export type SuggestFilters = {
  /** A Spoonacular meal type ("main course", "breakfast", ...) or null for any. */
  type: string | null
  /** Max ready time in minutes, or null. */
  maxTime: number | null
  /** Free-text search, or null. */
  query: string | null
}

export type EdgeRequest =
  /** Recipe ideas for the pantry (findByIngredients, or complexSearch with filters). */
  | {
      action: "suggest"
      householdId: string
      /** pantrySearchNames(): at most MAX_QUERY_NAMES names. */
      names: string[]
      filters: SuggestFilters
    }
  /** Full recipes by Spoonacular id (recipe page, saved list). At most 20 ids. */
  | { action: "info"; householdId: string; ids: number[] }
  /** Just the quota, for the "searches left" line. */
  | { action: "quota" }

export type EdgeErrorCode =
  /** The function is deployed but SPOONACULAR_API_KEY isn't set. */
  | "not_configured"
  /** Out of points (or under the reserve) until the reset; cached results still come back. */
  | "resting"
  /** This person made too many requests this hour (take_rate_limit). */
  | "rate_limited"
  | "unauthorized"
  | "bad_request"
  /** Spoonacular failed. */
  | "upstream"

export type EdgeSuccess<T> = T & { quota: RecipeQuota; error?: undefined }
export type EdgeFailure = { error: string; code: EdgeErrorCode; quota?: RecipeQuota }

export type SuggestResponse = EdgeSuccess<{ recipes: RecipeSummary[]; cached: boolean }> | EdgeFailure
export type InfoResponse = EdgeSuccess<{ recipes: RecipeDetail[] }> | EdgeFailure
export type QuotaResponse = EdgeSuccess<object> | EdgeFailure

/** Most ids one "info" call takes (informationBulk). */
export const MAX_INFO_IDS = 20
