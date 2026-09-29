"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { ActionResult } from "@/features/pantry/types"
import { requireHousehold } from "@/features/household/queries"
import { addListItems } from "@/features/list/actions"
import { categoryFromAisle } from "@/lib/ingredients/aisles"
import { findIngredient, guessCategory } from "@/lib/ingredients/catalog"
import { SpoonacularError } from "@/lib/spoonacular"

import { recipeListLines } from "./list"
import { getRecipe } from "./queries"

const input = z.object({
  recipeId: z.number().int().positive(),
  /** Indexes into the recipe's ingredient lines. */
  lines: z.array(z.number().int().nonnegative()).min(1, "Pick something to add.").max(100),
})

export type AddToListSummary = { added: number; toppedUp: number; alreadyOnList: number }

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

  const chosen = [...new Set(parsed.data.lines)].flatMap((i) => recipe.ingredients[i] ?? [])
  const listLines = recipeListLines(chosen, {
    category: (ingredient) => {
      const fromCatalog = findIngredient(ingredient.name)?.category
      if (fromCatalog) return fromCatalog
      const fromAisle = categoryFromAisle(ingredient.aisle)
      return fromAisle !== "other" ? fromAisle : guessCategory(ingredient.name)
    },
    recipe: { id: recipe.id, title: recipe.title },
  })
  // Tops up or skips what's already on the list (see src/features/list/plan.ts).
  const result = await addListItems(listLines)
  if (result.error !== undefined) return result

  revalidatePath("/list")
  revalidatePath(`/recipes/${recipe.id}`)
  return { added: result.added, toppedUp: result.toppedUp, alreadyOnList: result.alreadyOnList }
}
