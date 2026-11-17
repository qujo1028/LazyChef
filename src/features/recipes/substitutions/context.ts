import "server-only"

import type { RecipeDetail } from "@/lib/spoonacular"

import { getCacheStore } from "../cache"
import { recipeCacheKey } from "../cache-core"
import { loadRecipe } from "../queries"
import type { RecipeRef } from "../ref"

export type SubstitutionRecipe = {
  title: string
  ingredients: { original: string; name: string }[]
  /** Where the title and lines came from (the page's copy only for an expired Spoonacular recipe). */
  from: "database" | "cache" | "page"
}

/**
 * The recipe's title and ingredient lines, worked out on the server without spending
 * Spoonacular points: ours from the database, Spoonacular's from the shared hour-long cache
 * (the recipe page just put it there). Only when that has expired does it fall back to the
 * page's copy, which the input schema has already validated and length-capped. Null when the
 * recipe doesn't exist or isn't visible to this household.
 */
export async function loadSubstitutionRecipe(
  ref: RecipeRef,
  householdId: string,
  fallback: { title: string; ingredients: { original: string; name: string }[] } | undefined,
): Promise<SubstitutionRecipe | null> {
  if (ref.kind === "local") {
    const recipe = await loadRecipe(ref, householdId)
    return recipe ? { title: recipe.title, ingredients: recipe.ingredients, from: "database" } : null
  }
  const hit = await getCacheStore().get(recipeCacheKey(ref.id))
  const cached = hit?.value as Partial<RecipeDetail> | null | undefined
  if (cached && typeof cached.title === "string" && Array.isArray(cached.ingredients)) {
    return { title: cached.title, ingredients: cached.ingredients, from: "cache" }
  }
  return fallback ? { ...fallback, from: "page" } : null
}
