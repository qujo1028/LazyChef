// Pure: thumbs-up/down input validation, which cooks to ask about, and "Cook again".
import { z } from "zod"

import { cookedRecipe } from "@/features/activity/feed"
import { dayKey } from "@/features/activity/time"
import type { Json } from "@/types/database"

import { parseRecipeRef } from "./ref"

export type Rating = 1 | -1

/** What rateRecipe accepts. The ref is normalised to the string the database stores. */
export const rateInput = z.object({
  ref: z
    .string()
    .max(40)
    .transform((value, ctx) => {
      const ref = parseRecipeRef(value)
      if (!ref) {
        ctx.addIssue({ code: "custom", message: "That recipe doesn't exist." })
        return z.NEVER
      }
      return ref.kind === "spoonacular" ? String(ref.id) : ref.id
    }),
  rating: z.union([z.literal(1), z.literal(-1)], { error: "Pick thumbs up or thumbs down." }),
})

/** The error for someone who hasn't cooked it (rate_recipe raises 42501). */
export const NOT_COOKED_MESSAGE = "Cook this recipe first, then you can rate it."

/** Cooks older than this stop being asked about. */
export const PROMPT_MAX_AGE_DAYS = 14
/** Candidates sent to the browser (it hides dismissed ones, then shows one). */
export const PROMPT_CANDIDATES = 5

export type CookedRow = { batch_id: number | string; details: Json; created_at: string }

export type UnratedCook = { key: string; ref: string; title: string; cookedAt: string }

/**
 * The viewer's own cooks worth asking about, newest first, one per recipe: cooked on an
 * earlier local day (so not today), within PROMPT_MAX_AGE_DAYS, and not yet rated.
 * One cook = one batch (cook_recipe writes a row per ingredient).
 */
export function unratedCooks(
  rows: readonly CookedRow[],
  rated: ReadonlySet<string>,
  now: number,
  timeZone?: string,
): UnratedCook[] {
  const today = dayKey(now, timeZone)
  const oldest = now - PROMPT_MAX_AGE_DAYS * 86_400_000
  const seenBatches = new Set<string>()
  const seenRefs = new Set<string>()
  const out: UnratedCook[] = []
  const newestFirst = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  for (const row of newestFirst) {
    const batch = String(row.batch_id)
    if (seenBatches.has(batch)) continue
    seenBatches.add(batch)
    const recipe = cookedRecipe({ action: "cooked", details: row.details })
    if (!recipe || recipe.id === null) continue
    const at = Date.parse(row.created_at)
    if (!Number.isFinite(at) || at < oldest || dayKey(at, timeZone) >= today) continue
    if (rated.has(recipe.id) || seenRefs.has(recipe.id)) continue
    seenRefs.add(recipe.id)
    out.push({ key: batch, ref: recipe.id, title: recipe.title, cookedAt: row.created_at })
  }
  return out
}

/** The first candidate the viewer hasn't dismissed on this device. */
export function nextPrompt(cooks: readonly UnratedCook[], dismissed: ReadonlySet<string>): UnratedCook | null {
  return cooks.find((cook) => !dismissed.has(cook.key)) ?? null
}

export type HouseholdRating = { user_id: string; recipe_ref: string; rating: number; updated_at: string }

/** Recipes with a net-positive vote across the household, best first (ties: most recently voted). */
export function cookAgainRefs(ratings: readonly HouseholdRating[], limit = 12): string[] {
  const byRef = new Map<string, { net: number; latest: number }>()
  for (const row of ratings) {
    if (row.rating !== 1 && row.rating !== -1) continue
    const current = byRef.get(row.recipe_ref) ?? { net: 0, latest: 0 }
    current.net += row.rating
    current.latest = Math.max(current.latest, Date.parse(row.updated_at) || 0)
    byRef.set(row.recipe_ref, current)
  }
  return [...byRef.entries()]
    .filter(([, value]) => value.net > 0)
    .sort((a, b) => b[1].net - a[1].net || b[1].latest - a[1].latest)
    .slice(0, limit)
    .map(([ref]) => ref)
}
