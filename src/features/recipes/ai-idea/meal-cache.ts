import "server-only"

import { createHash } from "node:crypto"

import type { DietInput } from "@/features/preferences/diet"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

import { NO_HINTS, type TasteHints } from "../taste"
import type { AiRecipe } from "./idea"
import { ideasCacheKeySource, MEAL_IDEAS_TTL_SECONDS, readCachedIdeas, type CachedIdeas, type IdeaMeal } from "./meal-ideas"

/** "meal-ideas:v1:dinner-ish:<sha256>": short (the column allows 200), and no pantry names in it. */
export function mealIdeasCacheKey(meal: IdeaMeal, names: readonly string[], diet: DietInput | null, taste: TasteHints = NO_HINTS): string {
  const hash = createHash("sha256").update(ideasCacheKeySource(meal, names, diet, taste)).digest("hex")
  return `meal-ideas:v1:${meal.replace(/\s+/g, "-")}:${hash}`
}

/** A fresh cached answer, re-checked (see readCachedIdeas); null on a miss or a hiccup. */
export async function getCachedMealIdeas(
  householdId: string,
  key: string,
  diet: DietInput | null,
  names: readonly string[],
): Promise<AiRecipe[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ai_idea_cache")
    .select("response")
    .eq("household_id", householdId)
    .eq("cache_key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  if (error) {
    console.error("Reading the AI idea cache failed:", error.message)
    return null
  }
  return data ? readCachedIdeas(data.response, diet, names) : null
}

/** Keeps the answer for an hour. A failed write only costs a fresh request next time. */
export async function putCachedMealIdeas(householdId: string, key: string, ideas: AiRecipe[]): Promise<void> {
  const supabase = await createClient()
  const response: CachedIdeas = { ideas }
  const { error } = await supabase.rpc("put_ai_idea_cache", {
    p_household_id: householdId,
    p_cache_key: key,
    p_response: response as unknown as Json,
    p_ttl_seconds: MEAL_IDEAS_TTL_SECONDS,
  })
  if (error) console.error("Writing the AI idea cache failed:", error.message)
}
