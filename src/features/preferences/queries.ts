import "server-only"

import { cache } from "react"

import { requireViewer } from "@/features/household/queries"
import { createClient } from "@/lib/supabase/server"

import { NO_PREFERENCES, preferencesSchema, type FoodPreferences } from "./options"

/** The signed-in person's food preferences (defaults when they haven't set any). */
export const getMyPreferences = cache(async (): Promise<FoodPreferences> => {
  const viewer = await requireViewer()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("user_preferences")
    .select("diet, allergies, cuisines, world_recipes")
    .eq("user_id", viewer.id)
    .maybeSingle()
  if (error) {
    // Before the migration is applied (or on a hiccup), recipes still work, unfiltered.
    console.error("Loading food preferences failed:", error.message)
    return NO_PREFERENCES
  }
  if (!data) return NO_PREFERENCES
  return preferencesSchema.parse({
    diet: data.diet,
    allergies: data.allergies,
    cuisines: data.cuisines,
    worldRecipes: data.world_recipes,
  })
})
