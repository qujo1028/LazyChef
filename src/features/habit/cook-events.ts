// Pure: a person's cooks as events, and the DISTINCT COOK DAYS they fall on in a time zone.
// The ring, tiers and streak count days, not batches: two cooks on one day are 1.
// (If another module needs "cook days in a timezone", import cookDaySet from here.)
import { cookedRecipe } from "@/features/activity/feed"
import { dayKey } from "@/features/activity/time"
import type { Json } from "@/types/database"

/** One cook (one batch of "cooked" rows) by one person. */
export type CookEvent = {
  batchId: number
  /** ISO time of the batch (its latest row). */
  at: string
  /** The recipe cooked ("id:<ref>" or "title:<lowercase>"), or null with no recipe. */
  recipeKey: string | null
}

/** Which recipe a cooked row is for; the same recipe always gives the same key. */
export function recipeKeyOf(details: Json): string | null {
  const recipe = cookedRecipe({ action: "cooked", details })
  if (!recipe) return null
  return recipe.id !== null ? `id:${recipe.id}` : `title:${recipe.title.toLowerCase()}`
}

export type CookRow = { batchId: number; createdAt: string; details: Json }

/** Groups one person's "cooked" rows into one event per batch. */
export function toCookEvents(rows: readonly CookRow[]): CookEvent[] {
  const byBatch = new Map<number, CookEvent>()
  for (const row of rows) {
    const existing = byBatch.get(row.batchId)
    if (!existing) {
      byBatch.set(row.batchId, { batchId: row.batchId, at: row.createdAt, recipeKey: recipeKeyOf(row.details) })
    } else if (Date.parse(row.createdAt) > Date.parse(existing.at)) {
      existing.at = row.createdAt
    }
  }
  return [...byBatch.values()]
}

/** Adds or replaces events by batch id (live rows may repeat what the server already sent). */
export function mergeCookEvents(base: readonly CookEvent[], extra: readonly CookEvent[]): CookEvent[] {
  const byBatch = new Map(base.map((event) => [event.batchId, event]))
  for (const event of extra) byBatch.set(event.batchId, event)
  return [...byBatch.values()]
}

/** The calendar days (YYYY-MM-DD) with at least one cook, in `timeZone` (undefined = the runtime's). */
export function cookDaySet(events: readonly CookEvent[], timeZone?: string): Set<string> {
  const days = new Set<string>()
  for (const event of events) days.add(dayKey(Date.parse(event.at), timeZone))
  return days
}

/**
 * The event for a cook that just succeeded, so "after" can be derived as `before + this` instead of
 * re-reading the history. The key matches recipeKeyOf for the row cook_recipe writes (recipe_id for
 * Spoonacular, local_recipe_id for ours); the negative batch id cannot clash with a real one.
 */
export function syntheticCookEvent(ref: { id: string | number }, nowMs: number): CookEvent {
  return { batchId: -1, at: new Date(nowMs).toISOString(), recipeKey: `id:${ref.id}` }
}
