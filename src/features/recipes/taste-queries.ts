import "server-only"

import { cache } from "react"

import { cookedRecipe } from "@lazychef/core/activity/feed"
import { createClient } from "@/lib/supabase/server"

import { getLocalCards } from "./local"
import { getHouseholdRatings } from "./ratings"
import {
  buildTasteProfile,
  EMPTY_TASTE,
  hintRefs,
  NO_HINTS,
  tasteHints,
  type TasteHints,
  type TasteProfile,
} from "@lazychef/core/recipes/taste"

const isSpoonRef = (ref: string) => /^\d+$/.test(ref)

/** Most rated recipes whose contents are loaded for the similarity check. */
const PROFILE_RECIPES = 60

export type HouseholdTaste = { profile: TasteProfile; hints: TasteHints }

/**
 * The household's taste, from a few cheap selects (ratings, our own recipe cards, and for
 * Spoonacular recipes titles from the activity log and saved recipes). Never calls Spoonacular,
 * and falls back to "no taste" on any hiccup so suggestions still load.
 */
export const getHouseholdTaste = cache(async (householdId: string): Promise<HouseholdTaste> => {
  try {
    const ratings = await getHouseholdRatings(householdId)
    if (ratings.length === 0) return { profile: EMPTY_TASTE, hints: NO_HINTS }

    // Refs that matter: the hint candidates, plus the most recent votes for similarity.
    const hinted = hintRefs(ratings)
    const recent = [...ratings].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).map((r) => r.recipe_ref)
    const wanted = [...new Set([...hinted.liked, ...hinted.disliked, ...recent])].slice(0, PROFILE_RECIPES)
    const localIds = wanted.filter((ref) => !isSpoonRef(ref))
    const spoonIds = wanted.filter(isSpoonRef).map(Number)
    const supabase = await createClient()

    const [locals, cooked, saved] = await Promise.all([
      getLocalCards(localIds, householdId),
      spoonIds.length > 0
        ? supabase
            .from("activity_log")
            .select("details")
            .eq("household_id", householdId)
            .eq("action", "cooked")
            .not("details->recipe_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
      spoonIds.length > 0
        ? supabase.from("saved_recipes").select("recipe_id, title").eq("household_id", householdId).in("recipe_id", spoonIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (cooked.error) throw cooked.error
    if (saved.error) throw saved.error

    const titles = new Map<string, string>()
    for (const row of cooked.data) {
      const recipe = cookedRecipe({ action: "cooked", details: row.details })
      if (recipe?.id && !titles.has(recipe.id)) titles.set(recipe.id, recipe.title)
    }
    for (const row of saved.data) titles.set(String(row.recipe_id), row.title)
    for (const card of locals) titles.set(card.id, card.title)

    return {
      profile: buildTasteProfile(
        ratings,
        locals.map((card) => ({ id: card.id, cuisine: card.cuisine, ingredients: card.ingredients.filter((l) => !l.optional).map((l) => l.name) })),
      ),
      hints: tasteHints(ratings, titles),
    }
  } catch (error) {
    console.error("Loading the household's taste failed:", error instanceof Error ? error.message : error)
    return { profile: EMPTY_TASTE, hints: NO_HINTS }
  }
})
