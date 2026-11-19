// Generated from packages/core/src/recipes/pantry-names.ts by scripts/sync-edge-shared.mjs. Edit the source, then rerun it.
// The pantry names a recipe search or an AI idea starts from. Pure and free of the ingredient
// catalog (only the name normalizer), so the Edge Functions can use it (scripts/sync-edge-shared.mjs).
import { daysBetween } from "./days.ts"
import { normalizeIngredientName } from "./normalize.ts"

/** The pantry columns these need (a pantry_items row fits). */
export type PantryNameRow = { name: string; quantity: number | null; is_staple: boolean; expires_on: string | null }

/** Most names sent to Spoonacular in one search (keeps the URL and the match sane). */
export const MAX_QUERY_NAMES = 60

/** Staples and anything with some left (or not tracked). "Ran out" rows don't count. */
export function isAvailable(item: Pick<PantryNameRow, "quantity" | "is_staple">): boolean {
  return item.is_staple || item.quantity === null || item.quantity > 0
}

/**
 * The names to search with: what's available, soonest-expiring first (so it's never cut
 * off), one per ingredient, at most MAX_QUERY_NAMES.
 */
export function pantrySearchNames(items: readonly PantryNameRow[], today: string): string[] {
  const available = items.filter(isAvailable)
  const order = (item: PantryNameRow) => (item.expires_on === null ? Infinity : daysBetween(today, item.expires_on))
  const sorted = [...available].sort(
    (a, b) => order(a) - order(b) || Number(a.is_staple) - Number(b.is_staple) || a.name.localeCompare(b.name),
  )
  const seen = new Set<string>()
  const names: string[] = []
  for (const item of sorted) {
    const key = normalizeIngredientName(item.name)
    // Commas separate names in the request.
    const name = item.name.replace(/,/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
    if (!key || !name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length >= MAX_QUERY_NAMES) break
  }
  return names
}
