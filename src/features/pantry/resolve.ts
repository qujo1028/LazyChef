// OWNER: resolver agent. Contract stub — keep these exports and signatures.
import "server-only"

import { parseLines } from "@/lib/ingredients/parse-line"
import type { ResolvedItem } from "@/lib/ingredients/types"

export type SpoonacularStatus = {
  /** Whether Spoonacular was called for this batch (only for names we couldn't place). */
  called: boolean
  /** From the X-API-Quota-Left header, when called. */
  pointsLeft: number | null
  /** Human-readable problem (no key configured, quota used up, …), or null. */
  error: string | null
}

export type ResolveResult = { items: ResolvedItem[]; spoonacular: SpoonacularStatus }

/**
 * Turns typed/pasted text into reviewable items: parse amounts locally, then pick
 * each category from (1) the household's own fixes, (2) the built-in library,
 * (3) Spoonacular's parseIngredients for names still unknown (1 point each, only
 * if SPOONACULAR_API_KEY is set), (4) a keyword guess.
 */
export async function resolveItems(householdId: string, text: string): Promise<ResolveResult> {
  void householdId
  return {
    items: parseLines(text).map((line) => ({ ...line, category: "other", categorySource: "fallback", ingredientId: null })),
    spoonacular: { called: false, pointsLeft: null, error: null },
  }
}
