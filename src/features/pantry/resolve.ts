import "server-only"

import { findIngredient, guessCategory, normalizeIngredientName } from "@/lib/ingredients/catalog"
import { categoryFromAisle } from "@/lib/ingredients/aisles"
import { parseLines } from "@/lib/ingredients/parse-line"
import { isSpoonacularConfigured, parseIngredients, SpoonacularError } from "@/lib/spoonacular"
import { createClient } from "@/lib/supabase/server"

import {
  buildHouseholdKnowledge,
  MAX_LINES,
  resolveParsedLines,
  spoonacularFailureMessage,
  type ResolveResult,
  type SpoonacularLookup,
} from "./resolve-core"

export type { ResolveResult, SpoonacularStatus } from "./resolve-core"

/** Longest ingredient_key the category_overrides table accepts. */
const MAX_KEY_LENGTH = 80
/** Enough for any real pantry; only name/category/id are read. */
const MAX_PANTRY_ROWS = 2000

async function lookupWithSpoonacular(names: string[]): Promise<SpoonacularLookup> {
  try {
    const { ingredients, quota } = await parseIngredients(names)
    return {
      ok: true,
      hits: ingredients.map((ingredient) => (ingredient ? { id: ingredient.id, aisle: ingredient.aisle } : null)),
      pointsLeft: quota?.left ?? null,
    }
  } catch (error) {
    if (error instanceof SpoonacularError) {
      console.warn(`[spoonacular] parseIngredients failed: ${error.code}${error.status ? ` (${error.status})` : ""}`)
      return { ok: false, error: spoonacularFailureMessage(error.message) }
    }
    console.error("[spoonacular] parseIngredients failed", error)
    return { ok: false, error: spoonacularFailureMessage("Spoonacular had a problem.") }
  }
}

/**
 * Turns typed/pasted text into reviewable items: parse amounts locally, then pick
 * each category from (1) the household's own fixes, (2) the built-in library,
 * (3) Spoonacular's parseIngredients for names still unknown (1 point each, only
 * if SPOONACULAR_API_KEY is set), (4) a keyword guess.
 */
export async function resolveItems(householdId: string, text: string): Promise<ResolveResult> {
  const lines = parseLines(text).slice(0, MAX_LINES)
  if (lines.length === 0) return { items: [], spoonacular: { called: false, pointsLeft: null, error: null } }

  const keys = [
    ...new Set(lines.map((line) => normalizeIngredientName(line.name)).filter((key) => key && key.length <= MAX_KEY_LENGTH)),
  ]
  const supabase = await createClient()
  const [overrides, pantry] = await Promise.all([
    keys.length > 0
      ? supabase
          .from("category_overrides")
          .select("ingredient_key, category")
          .eq("household_id", householdId)
          .in("ingredient_key", keys)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("pantry_items")
      .select("name, category, ingredient_id")
      .eq("household_id", householdId)
      .order("updated_at", { ascending: false })
      .limit(MAX_PANTRY_ROWS),
  ])
  if (overrides.error) throw overrides.error
  if (pantry.error) throw pantry.error

  return resolveParsedLines(lines, {
    deps: { normalize: normalizeIngredientName, findIngredient, guessCategory, categoryFromAisle },
    knowledge: buildHouseholdKnowledge(overrides.data ?? [], pantry.data ?? [], normalizeIngredientName),
    lookup: isSpoonacularConfigured() ? lookupWithSpoonacular : null,
  })
}
