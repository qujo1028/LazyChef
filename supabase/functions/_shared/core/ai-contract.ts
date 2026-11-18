// Generated from packages/core/src/ai/edge-contract.ts by scripts/sync-edge-shared.mjs. Edit the source, then rerun it.
// The contract between the mobile app and the `ai` Supabase Edge Function, which holds the
// Groq key and makes the app's AI calls. Pure types and constants, imported by apps/mobile and
// mirrored in supabase/functions/ai (scripts/sync-edge-shared.mjs).
//
// v1 has one AI feature on the phone: recipe ideas from the Ideas sheet in the Recipes header
// (docs/product-scope.md, "One Ideas entry point"). The function reads the pantry, diet and
// taste itself, as the caller (RLS); the app sends only the meal and an optional hint.

export const AI_FUNCTION = "ai"

/** The meals the Ideas sheet offers. Same values as the web's IDEA_MEALS. */
export const AI_IDEA_MEALS = [
  "breakfast",
  "lunch",
  "main course",
  "side dish",
  "salad",
  "soup",
  "snack",
  "dessert",
  "any",
] as const
export type AiIdeaMeal = (typeof AI_IDEA_MEALS)[number]

/** Longest hint ("quick", "something spicy") the function accepts. Same as the web. */
export const AI_MAX_HINT_LENGTH = 100

/** One ingredient line of an idea. `fromPantry` is checked against the pantry by the function. */
export type AiIdeaIngredient = { name: string; amount: string; fromPantry: boolean }

/** One recipe idea. Same shape as the web's AiRecipe. */
export type AiIdeaRecipe = {
  title: string
  description: string
  servings: number
  minutes: number
  ingredients: AiIdeaIngredient[]
  steps: string[]
}

/** An idea plus the ingredient names the pantry doesn't have (for "Add missing to list"). */
export type AiIdea = { recipe: AiIdeaRecipe; missing: string[] }

/**
 * The household's free weekly AI allowance as the app shows it ("7 of 10 free ideas left this
 * week"). Pro households are never counted.
 */
export type AiAllowance = {
  pro: boolean
  /** Uses in the last 7 days (0 for Pro). */
  used: number
  /** The free weekly limit (AI_FREE_WEEKLY). */
  limit: number
  /** When the oldest counted use drops out, ISO time, or null when nothing is counted. */
  resetsAt: string | null
}

export type AiRequest =
  /** Up to three recipe ideas for a meal from the household's pantry. Takes one free use on a cache miss. */
  | { action: "ideas"; householdId: string; meal: AiIdeaMeal; hint?: string }
  /** Just the allowance, for the count line. Takes nothing. */
  | { action: "allowance"; householdId: string }

export type AiErrorCode =
  /** The function is deployed but GROQ_API_KEY isn't set (or the function isn't deployed). */
  | "not_configured"
  /** The household used its free weekly ideas (take_ai_allowance said no). `allowance.resetsAt` says when more come back. */
  | "limit_reached"
  /** This person made too many AI requests this hour (take_rate_limit 'ai'). */
  | "rate_limited"
  /** The pantry has nothing to cook from. */
  | "empty_pantry"
  | "unauthorized"
  | "bad_request"
  /** The model failed, or its answer couldn't be used (bad JSON, broke the diet). */
  | "upstream"

export type AiSuccess<T> = T & { allowance: AiAllowance; error?: undefined }
export type AiFailure = { error: string; code: AiErrorCode; allowance?: AiAllowance }

export type IdeasResponse = AiSuccess<{ ideas: AiIdea[]; cached: boolean }> | AiFailure
export type AllowanceResponse = AiSuccess<object> | AiFailure
