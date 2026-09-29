"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/features/pantry/types"
import { requireHousehold } from "@/features/household/queries"
import { categoryFromAisle } from "@/lib/ingredients/aisles"
import { findIngredient, guessCategory, normalizeIngredientName } from "@/lib/ingredients/catalog"
import { SpoonacularError } from "@/lib/spoonacular"
import { createClient } from "@/lib/supabase/server"

import { planListAdditions } from "./list"
import { getRecipe } from "./queries"

const input = z.object({
  recipeId: z.number().int().positive(),
  /** Indexes into the recipe's ingredient lines. */
  lines: z.array(z.number().int().nonnegative()).min(1, "Pick something to add.").max(100),
})

export type AddToListSummary = { added: number; alreadyOnList: number }

/**
 * Adds some of a recipe's ingredient lines to the shopping list, tagged with the recipe.
 * Ingredients already on the list (and not yet checked off) aren't added twice. The
 * recipe comes from the household's cache, so the client can't make up ingredients.
 */
export async function addRecipeIngredientsToList(
  recipeId: number,
  lines: number[],
): Promise<ActionResult<AddToListSummary>> {
  const parsed = input.safeParse({ recipeId, lines })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Pick something to add." }

  const { household } = await requireHousehold()
  let recipe
  try {
    recipe = (await getRecipe(household.id, parsed.data.recipeId)).value
  } catch (error) {
    if (error instanceof SpoonacularError) return { error: error.message }
    console.error("Loading the recipe failed:", error)
    return { error: "Couldn't load that recipe. Try again." }
  }

  const supabase = await createClient()
  const { data: open, error: loadError } = await supabase
    .from("shopping_list_items")
    .select("name, ingredient_id")
    .eq("household_id", household.id)
    .is("checked_at", null)
  if (loadError) {
    console.error("Loading the shopping list failed:", loadError.message)
    return { error: "That didn't go through. Check your connection and try again." }
  }

  const chosen = [...new Set(parsed.data.lines)].flatMap((i) => recipe.ingredients[i] ?? [])
  const plan = planListAdditions(chosen, open, {
    normalize: normalizeIngredientName,
    category: (ingredient) => {
      const fromCatalog = findIngredient(ingredient.name)?.category
      if (fromCatalog) return fromCatalog
      const fromAisle = categoryFromAisle(ingredient.aisle)
      return fromAisle !== "other" ? fromAisle : guessCategory(ingredient.name)
    },
    recipe: { id: recipe.id, title: recipe.title },
  })

  if (plan.items.length > 0) {
    const { error } = await supabase.rpc("add_to_shopping_list", { p_household_id: household.id, p_items: plan.items })
    if (error) {
      console.error("add_to_shopping_list failed:", error.code, error.message)
      return { error: "That didn't go through. Check your connection and try again." }
    }
  }

  revalidatePath("/list")
  revalidatePath(`/recipes/${recipe.id}`)
  return { added: plan.items.length, alreadyOnList: plan.alreadyOnList }
}
