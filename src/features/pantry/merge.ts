// Pure: decides which new items top up something already in the pantry, and
// builds the p_items payload for public.add_pantry_items().
import type { Category } from "@/lib/ingredients/types"
import type { NewPantryItem, PantryItem } from "./types"

export type ExistingItem = Pick<PantryItem, "id" | "name" | "quantity" | "unit" | "ingredient_id">

/** Top up an existing item; `quantity` is already in that item's unit. */
export type MergeEntry = { merge_into: string; quantity: number; expires_on: string | null }

export type InsertEntry = {
  name: string
  quantity: number | null
  unit: string
  category: Category
  expires_on: string | null
  is_staple: boolean
  ingredient_id: number | null
}

/** Make a ran-out item untracked (quantity null) again: "eggs" typed with no amount after eggs ran out. */
export type UntrackEntry = { merge_into: string; untrack: true; expires_on: string | null }

export type PlanEntry = MergeEntry | UntrackEntry | InsertEntry

export type MergeDeps = {
  /** Stable matching key for a name (normalizeIngredientName). */
  normalize: (name: string) => string
  /** convertQuantity: null when the units can't be converted. */
  convert: (quantity: number, from: string, to: string) => number | null
}

/** What happened to one incoming line. */
export type LineOutcome =
  /** A new pantry row (possibly shared with earlier lines of the same thing). */
  | { type: "insert" }
  /** Tops up this existing item (or brings it back from "ran out"). */
  | { type: "merge"; into: string }
  /** No amount, and it's already on hand: skipped. */
  | { type: "on-hand" }

export type AdditionPlan = {
  entries: PlanEntry[]
  /** One per incoming line, in order. */
  outcomes: LineOutcome[]
  /** New pantry rows, plus ran-out rows brought back as untracked. */
  added: number
  /** Existing rows that get more. */
  toppedUp: number
  /** Lines without an amount for things that are already on hand (skipped). */
  alreadyOnHand: number
}

/** Trims float noise from unit conversions: 0.1 + 0.2 → 0.3. */
export function roundQuantity(quantity: number): number {
  return Math.round(quantity * 10_000) / 10_000
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

/**
 * Rules, per incoming line (in order):
 * - "Same thing" = same ingredient_id (both known) or same normalized name.
 * - With an amount: top up the best existing item that is the same thing, tracks a
 *   quantity (null = untracked staple, never merged into; 0 = ran out, fine) and whose
 *   unit converts. Best = ingredient id match, then same unit, then pantry order.
 *   Otherwise fold into an earlier new line from this batch, otherwise insert.
 * - Without an amount: skip if the same thing is already on hand (untracked or > 0),
 *   here or earlier in the batch. Otherwise, if it ran out (0), make that row untracked
 *   again rather than adding a second one; failing that, insert an untracked row.
 * - Several lines topping up one item become one merge entry; expiry = earliest.
 */
export function planAdditions(
  incoming: readonly NewPantryItem[],
  existing: readonly ExistingItem[],
  deps: MergeDeps,
): AdditionPlan {
  // Copies: bringing back a ran-out row changes its quantity for the lines after it.
  const current = existing.map((item) => ({ item: { ...item }, key: deps.normalize(item.name) }))
  const inserts: { key: string; entry: InsertEntry }[] = []
  const merges = new Map<string, MergeEntry>()
  const entries: PlanEntry[] = []
  const outcomes: LineOutcome[] = []
  let alreadyOnHand = 0
  let untracked = 0

  for (const line of incoming) {
    const key = deps.normalize(line.name)
    const same = (otherKey: string, otherId: number | null) =>
      otherKey === key || (line.ingredient_id !== null && otherId === line.ingredient_id)

    if (line.quantity === null) {
      const onHand =
        current.some(({ item, key: k }) => same(k, item.ingredient_id) && item.quantity !== 0) ||
        inserts.some(({ key: k, entry }) => same(k, entry.ingredient_id) && entry.quantity !== 0)
      if (onHand) {
        alreadyOnHand++
        outcomes.push({ type: "on-hand" })
        continue
      }
      const ranOut = current.find(({ item, key: k }) => same(k, item.ingredient_id) && item.quantity === 0)
      if (ranOut && !merges.has(ranOut.item.id)) {
        ranOut.item.quantity = null
        untracked++
        entries.push({ merge_into: ranOut.item.id, untrack: true, expires_on: line.expires_on })
        outcomes.push({ type: "merge", into: ranOut.item.id })
      } else insert(key, line)
      continue
    }

    const quantity = line.quantity
    const target = current
      .filter(({ item, key: k }) => item.quantity !== null && same(k, item.ingredient_id))
      .map(({ item }) => ({ item, amount: deps.convert(quantity, line.unit, item.unit) }))
      .filter((c): c is { item: ExistingItem; amount: number } => c.amount !== null)
      .map((c) => ({
        ...c,
        score:
          (line.ingredient_id !== null && c.item.ingredient_id === line.ingredient_id ? 2 : 0) +
          (c.item.unit === line.unit ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score)[0]

    if (target) {
      const merge = merges.get(target.item.id)
      if (merge) {
        merge.quantity = roundQuantity(merge.quantity + target.amount)
        merge.expires_on = earliest(merge.expires_on, line.expires_on)
      } else {
        const entry: MergeEntry = {
          merge_into: target.item.id,
          quantity: roundQuantity(target.amount),
          expires_on: line.expires_on,
        }
        merges.set(target.item.id, entry)
        entries.push(entry)
      }
      outcomes.push({ type: "merge", into: target.item.id })
      continue
    }

    const pending = inserts.find(({ key: k, entry }) => {
      if (!same(k, entry.ingredient_id)) return false
      return entry.quantity === null || deps.convert(quantity, line.unit, entry.unit) !== null
    })
    if (pending) {
      const { entry } = pending
      if (entry.quantity === null) {
        // "eggs" then "6 eggs": the untracked line becomes the tracked one.
        entry.quantity = roundQuantity(quantity)
        entry.unit = line.unit
      } else {
        entry.quantity = roundQuantity(entry.quantity + (deps.convert(quantity, line.unit, entry.unit) ?? 0))
      }
      entry.expires_on = earliest(entry.expires_on, line.expires_on)
      entry.is_staple ||= line.is_staple
      outcomes.push({ type: "insert" })
      continue
    }

    insert(key, line)
  }

  function insert(key: string, line: NewPantryItem) {
    const entry: InsertEntry = {
      name: line.name,
      quantity: line.quantity === null ? null : roundQuantity(line.quantity),
      unit: line.unit,
      category: line.category,
      expires_on: line.expires_on,
      is_staple: line.is_staple,
      ingredient_id: line.ingredient_id,
    }
    inserts.push({ key, entry })
    entries.push(entry)
    outcomes.push({ type: "insert" })
  }

  return { entries, outcomes, added: inserts.length + untracked, toppedUp: merges.size, alreadyOnHand }
}

/** Category fixes to remember for the household: one per normalized name, last wins. */
export function categoryOverrides(
  items: readonly Pick<NewPantryItem, "name" | "category" | "category_changed">[],
  normalize: (name: string) => string,
): { ingredient_key: string; category: Category }[] {
  const byKey = new Map<string, Category>()
  for (const item of items) {
    if (!item.category_changed) continue
    const key = normalize(item.name).slice(0, 80)
    if (key) byKey.set(key, item.category)
  }
  return [...byKey].map(([ingredient_key, category]) => ({ ingredient_key, category }))
}

/** "Added 5 items, topped up 2" (and "1 was already on hand"). */
export function describeAdditions({ added, toppedUp, alreadyOnHand }: Pick<AdditionPlan, "added" | "toppedUp" | "alreadyOnHand">): string {
  const parts: string[] = []
  if (added) parts.push(`added ${added} ${added === 1 ? "item" : "items"}`)
  if (toppedUp) parts.push(`topped up ${toppedUp}`)
  if (alreadyOnHand) parts.push(`${alreadyOnHand} already on hand`)
  if (parts.length === 0) return "Nothing to add"
  const text = parts.join(", ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
