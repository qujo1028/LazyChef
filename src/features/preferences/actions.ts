"use server"

import { revalidatePath } from "next/cache"

import { requireViewer } from "@/features/household/queries"
import type { ActionResult } from "@/features/pantry/types"
import { createClient } from "@/lib/supabase/server"

import { preferencesSchema, type FoodPreferences } from "./options"

/** Saves the signed-in person's diet, allergies, cuisines and world-recipes default. */
export async function savePreferences(input: FoodPreferences): Promise<ActionResult> {
  const parsed = preferencesSchema.safeParse(input)
  if (!parsed.success) return { error: "Those preferences didn't look right. Try again." }

  await requireViewer()
  const supabase = await createClient()
  const { diet, allergies, cuisines, worldRecipes } = parsed.data
  const { error } = await supabase.rpc("set_my_preferences", {
    p_diet: diet,
    p_allergies: allergies,
    p_cuisines: cuisines,
    p_world_recipes: worldRecipes,
  })
  if (error) {
    console.error("Saving food preferences failed:", error.message)
    return { error: "Couldn't save your preferences. Try again." }
  }
  revalidatePath("/recipes")
  revalidatePath("/household")
  return {}
}
