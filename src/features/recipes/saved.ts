// Pure: the Saved tab. Cook history from the activity log, the match against the
// pantry, and sorting. The pantry match itself comes from match.ts on the server.
import { cookedRecipe } from "@/features/activity/feed"
import { dayLabel } from "@/features/activity/time"
import type { Json } from "@/types/database"

import type { RecipeSource } from "./ref"

/** A "cooked" activity row, as loaded for history. */
export type CookedRow = { batch_id: number | string; details: Json; created_at: string }

export type CookHistory = { count: number; lastAt: string }

/** How many times each recipe was cooked (one cook = one batch) and when last. */
export function cookHistory(rows: readonly CookedRow[]): Map<string, CookHistory> {
  const seen = new Set<string>()
  const history = new Map<string, CookHistory>()
  for (const row of rows) {
    const recipe = cookedRecipe({ action: "cooked", details: row.details })
    if (!recipe || recipe.id === null) continue
    const batch = `${row.batch_id}`
    if (seen.has(batch)) continue
    seen.add(batch)
    const current = history.get(recipe.id)
    if (!current) history.set(recipe.id, { count: 1, lastAt: row.created_at })
    else {
      current.count += 1
      if (Date.parse(row.created_at) > Date.parse(current.lastAt)) current.lastAt = row.created_at
    }
  }
  return history
}

export type SavedMatch = {
  /** Ingredients the pantry covers (water, salt and other basics aren't counted). */
  have: number
  /** And the names of the ones it still needs. */
  need: string[]
}

export type SavedRecipe = {
  /** Its ref: Spoonacular's id or our uuid (see ref.ts). */
  id: string
  source: RecipeSource
  title: string
  image: string | null
  readyInMinutes: number | null
  savedAt: string
  savedBy: string | null
  /** Null when the recipe's details couldn't be loaded (no points left, no key). */
  match: SavedMatch | null
  history: CookHistory | null
}

export const SAVED_SORTS = [
  { value: "ready", label: "Ready to cook" },
  { value: "recent", label: "Newest" },
  { value: "cooked", label: "Most cooked" },
] as const

export type SavedSort = (typeof SAVED_SORTS)[number]["value"]

export function parseSavedSort(value: string | string[] | undefined): SavedSort {
  const one = Array.isArray(value) ? value[0] : value
  return SAVED_SORTS.some((sort) => sort.value === one) ? (one as SavedSort) : "ready"
}

/** "Can make now" when nothing's missing. */
export function canMakeNow(recipe: Pick<SavedRecipe, "match">): boolean {
  return recipe.match !== null && recipe.match.need.length === 0
}

const newest = (a: SavedRecipe, b: SavedRecipe) => Date.parse(b.savedAt) - Date.parse(a.savedAt) || a.id.localeCompare(b.id)

export function sortSaved(recipes: readonly SavedRecipe[], sort: SavedSort): SavedRecipe[] {
  const sorted = [...recipes]
  if (sort === "recent") return sorted.sort(newest)
  if (sort === "cooked") {
    return sorted.sort(
      (a, b) =>
        (b.history?.count ?? 0) - (a.history?.count ?? 0) ||
        Date.parse(b.history?.lastAt ?? "1970-01-01") - Date.parse(a.history?.lastAt ?? "1970-01-01") ||
        newest(a, b),
    )
  }
  // Ready to cook: fewest missing first; unknown matches last.
  const missing = (r: SavedRecipe) => (r.match === null ? Number.POSITIVE_INFINITY : r.match.need.length)
  return sorted.sort((a, b) => missing(a) - missing(b) || newest(a, b))
}

/** "Cooked 3 times · last Sep 12" (or "Cooked once · last today"). */
export function historyLabel(history: CookHistory, now: number, timeZone?: string): string {
  const times = history.count === 1 ? "once" : history.count === 2 ? "twice" : `${history.count} times`
  const label = dayLabel(Date.parse(history.lastAt), now, timeZone)
  const when = label === "Today" || label === "Yesterday" ? label.toLowerCase() : label.replace(/^\w+, /, "")
  return `Cooked ${times} · last ${when}`
}
