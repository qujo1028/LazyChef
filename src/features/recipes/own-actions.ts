"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireHousehold } from "@/features/household/queries"
import { dbError } from "@/features/pantry/server-helpers"
import type { ActionResult } from "@/features/pantry/types"
import { findIngredient, normalizeIngredientName } from "@/lib/ingredients/catalog"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database"

import { PHOTO_BUCKET } from "./local"
import { fieldErrors, isHouseholdPhoto, recipePayload, validateOwnRecipe, type OwnRecipeDraft, type OwnRecipeInput } from "./own-recipe"

export type SaveOwnResult = ActionResult<{ id: string }> & { fields?: Partial<Record<keyof OwnRecipeDraft, string>> }

const recipeId = z.uuid()

type Db = Awaited<ReturnType<typeof createClient>>

async function removePhoto(supabase: Db, path: string | null, householdId: string) {
  if (!path || !isHouseholdPhoto(path, householdId)) return
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path])
  if (error) console.error("Removing a recipe photo failed:", error.message)
}

/**
 * Adds (no id) or updates one of the household's own recipes, ingredients and all, in one
 * transaction (save_household_recipe). The photo was already uploaded by the browser into
 * the household's folder; a replaced one is removed afterwards.
 */
export async function saveOwnRecipe(input: OwnRecipeInput, id: string | null = null): Promise<SaveOwnResult> {
  const parsed = validateOwnRecipe(input)
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error)
    return { error: Object.values(fields)[0] ?? "Check the recipe.", fields }
  }
  if (id !== null && !recipeId.safeParse(id).success) return { error: "That recipe doesn't exist." }

  const { household } = await requireHousehold()
  const recipe = parsed.data
  if (recipe.photoPath && !isHouseholdPhoto(recipe.photoPath, household.id)) {
    return { error: "That photo didn't upload properly. Try it again.", fields: { photoPath: "That photo didn't upload properly." } }
  }

  const supabase = await createClient()
  let previousPhoto: string | null = null
  if (id !== null) {
    const { data, error } = await supabase
      .from("recipes")
      .select("photo_path")
      .eq("id", id)
      .eq("household_id", household.id)
      .maybeSingle()
    if (error) return { error: dbError("Loading the recipe", error) }
    if (!data) return { error: "That recipe was deleted, or isn't your household's." }
    previousPhoto = data.photo_path
  }

  // The library id and name key come from the server's copy of the ingredient library.
  const ingredients = recipe.ingredients.map((line) => ({
    ...line,
    name_key: normalizeIngredientName(line.name).slice(0, 120),
    ingredient_id: findIngredient(line.name)?.id ?? null,
  }))

  const { data, error } = await supabase.rpc("save_household_recipe", {
    p_household_id: household.id,
    p_recipe_id: id,
    p_recipe: recipePayload(recipe) as unknown as Json,
    p_ingredients: ingredients as unknown as Json,
  })
  if (error) return { error: dbError("save_household_recipe", error) }

  if (previousPhoto && previousPhoto !== recipe.photoPath) await removePhoto(supabase, previousPhoto, household.id)

  revalidatePath("/recipes", "layout")
  return { id: data }
}

/** Deletes one of the household's own recipes (and its photo). Saves and ingredients go with it. */
export async function deleteOwnRecipe(id: string): Promise<ActionResult> {
  if (!recipeId.safeParse(id).success) return { error: "That recipe doesn't exist." }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recipes")
    .delete()
    .eq("id", id)
    .eq("household_id", household.id)
    .select("photo_path")
  if (error) return { error: dbError("deleteOwnRecipe", error) }
  if (data.length === 0) return { error: "That recipe was already deleted." }

  await removePhoto(supabase, data[0].photo_path, household.id)
  revalidatePath("/recipes", "layout")
  return {}
}

/** A photo uploaded for a recipe that was then never saved (the form was left). */
export async function discardRecipePhoto(path: string): Promise<ActionResult> {
  if (typeof path !== "string" || path.length > 200) return { error: "No such photo." }
  const { household } = await requireHousehold()
  if (!isHouseholdPhoto(path, household.id)) return { error: "No such photo." }
  const supabase = await createClient()
  // Only if no recipe uses it.
  const { data } = await supabase.from("recipes").select("id").eq("photo_path", path).limit(1)
  if (data && data.length > 0) return {}
  await removePhoto(supabase, path, household.id)
  return {}
}
