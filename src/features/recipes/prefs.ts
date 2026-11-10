import { conflicts, type DietInput } from "@/features/preferences/diet"
import type { Cuisine } from "@/features/preferences/options"
import type { RecipeSummary } from "@/lib/spoonacular/recipe-shapes"

import type { LocalRecipeCard } from "./local-match"
import type { Suggestion } from "./match"

/** The parts of someone's food preferences that change recipe ideas. */
export type RecipePrefs = {
  /** Null when "Show all recipes" is on or they have no diet or allergies. */
  diet: DietInput | null
  cuisines: readonly Cuisine[]
}

/** A library or household recipe is fine unless a required line breaks the diet. */
export function localFits(recipe: LocalRecipeCard, diet: DietInput | null): boolean {
  if (!diet) return true
  return !conflicts(
    recipe.ingredients.filter((line) => !line.optional).map((line) => line.name),
    diet,
  )
}

/** Spoonacular already filters by diet in searches; this also catches findByIngredients results. */
export function spoonacularFits(recipe: RecipeSummary, diet: DietInput | null): boolean {
  if (!diet) return true
  return !conflicts(
    [...recipe.used, ...recipe.missed].map((line) => line.name),
    diet,
  )
}

/** How the library spells each cuisine ("Italian" or "Italy"). */
const CUISINE_NAMES: Record<Cuisine, string[]> = {
  american: ["american", "united states"],
  british: ["british", "united kingdom", "english", "scottish", "welsh"],
  italian: ["italian", "italy"],
  mexican: ["mexican", "mexico"],
  chinese: ["chinese", "china"],
  japanese: ["japanese", "japan"],
  thai: ["thai", "thailand"],
  indian: ["indian", "india"],
  french: ["french", "france"],
  spanish: ["spanish", "spain"],
  greek: ["greek", "greece"],
}

export function likesCuisine(cuisine: string | null | undefined, liked: readonly Cuisine[]): boolean {
  if (!cuisine || liked.length === 0) return false
  const name = cuisine.trim().toLowerCase()
  return liked.some((c) => CUISINE_NAMES[c].includes(name))
}

/**
 * Liked cuisines first among ideas that are equally close (same number of things
 * missing). Otherwise the order stays as ranked.
 */
export function preferCuisines(list: readonly Suggestion[], likedIds: ReadonlySet<string>): Suggestion[] {
  if (likedIds.size === 0) return [...list]
  return list
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.need.length - b.item.need.length ||
        Number(likedIds.has(b.item.id)) - Number(likedIds.has(a.item.id)) ||
        a.index - b.index,
    )
    .map(({ item }) => item)
}
