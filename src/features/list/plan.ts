// Pure: decides which new lines top up something already on the list, and builds the
// p_items payload for public.add_to_shopping_list(). The catalog/unit helpers are passed in.
import { roundQuantity } from "@/features/pantry/merge"

import { listUnit } from "./display"
import type { ListItem, NewListLine } from "./types"

/** An unchecked line already on the list. */
export type OpenLine = Pick<ListItem, "id" | "name" | "quantity" | "unit" | "ingredient_id">

/** Add more to an unchecked line; `quantity` is already in that line's unit. */
export type ListMergeEntry = { merge_into: string; quantity: number }

export type ListPlanEntry = NewListLine | ListMergeEntry

export type ListPlanDeps = {
  /** normalizeIngredientName. */
  normalize: (name: string) => string
  /** convertQuantity: null when the units can't be converted. */
  convert: (quantity: number, from: string, to: string) => number | null
}

export type ListPlan = {
  entries: ListPlanEntry[]
  /** New lines. */
  added: number
  /** Existing lines that get more. */
  toppedUp: number
  /** The same thing is already on the list and there's nothing to add to it. */
  alreadyOnList: number
}

const unitKey = (unit: string | null) => unit ?? "count"

/**
 * Rules, per incoming line (in order):
 * - "Same thing" = same ingredient_id (both known) or same normalized name.
 * - If an unchecked line is the same thing: with both amounts known and units that convert,
 *   top it up (several incoming lines topping up one line become one entry). Otherwise it's
 *   already on the list ("any amount" covers any amount; "1 head garlic" covers "2 cloves").
 * - Otherwise fold into an earlier new line from this batch when possible, else a new line.
 */
export function planListAdditions(
  incoming: readonly NewListLine[],
  open: readonly OpenLine[],
  deps: ListPlanDeps,
): ListPlan {
  const current = open.map((line) => ({ line, key: deps.normalize(line.name) }))
  const inserts: { key: string; entry: NewListLine }[] = []
  const merges = new Map<string, ListMergeEntry>()
  const entries: ListPlanEntry[] = []
  let alreadyOnList = 0

  for (const raw of incoming) {
    const line: NewListLine = {
      ...raw,
      name: raw.name.trim(),
      unit: listUnit(raw.unit),
      quantity: raw.quantity === null ? null : roundQuantity(raw.quantity),
    }
    const key = deps.normalize(line.name) || line.name.toLowerCase()
    const same = (otherKey: string, otherId: number | null) =>
      otherKey === key || (line.ingredient_id !== null && otherId === line.ingredient_id)

    const matches = current.filter(({ line: other, key: k }) => same(k, other.ingredient_id))
    if (matches.length > 0) {
      const quantity = line.quantity
      const target =
        quantity === null
          ? undefined
          : matches
              .filter(({ line: other }) => other.quantity !== null)
              .map(({ line: other }) => ({ other, amount: deps.convert(quantity, unitKey(line.unit), unitKey(other.unit)) }))
              .find((c): c is { other: OpenLine; amount: number } => c.amount !== null)
      if (!target) {
        alreadyOnList++
        continue
      }
      const merge = merges.get(target.other.id)
      if (merge) merge.quantity = roundQuantity(merge.quantity + target.amount)
      else {
        const entry = { merge_into: target.other.id, quantity: roundQuantity(target.amount) }
        merges.set(target.other.id, entry)
        entries.push(entry)
      }
      continue
    }

    const pending = inserts.find(({ key: k, entry }) => same(k, entry.ingredient_id))
    if (pending) {
      const { entry } = pending
      if (entry.quantity === null || line.quantity === null) {
        // "milk" and "2 cups milk": keep an amount if either gave one.
        if (entry.quantity === null && line.quantity !== null) {
          entry.quantity = line.quantity
          entry.unit = line.unit
        }
      } else {
        const amount = deps.convert(line.quantity, unitKey(line.unit), unitKey(entry.unit))
        if (amount === null) {
          // Different kinds of amount ("1 bag" and "2 lb"): the line says "any amount".
          entry.quantity = null
          entry.unit = null
        } else entry.quantity = roundQuantity(entry.quantity + amount)
      }
      entry.note ??= line.note
      continue
    }

    inserts.push({ key, entry: line })
    entries.push(line)
  }

  return { entries, added: inserts.length, toppedUp: merges.size, alreadyOnList }
}

/** "Added 3 items, topped up 1" (and "1 already on the list"). */
export function describeListAdditions({ added, toppedUp, alreadyOnList }: Omit<ListPlan, "entries">): string {
  const parts: string[] = []
  if (added) parts.push(`added ${added} ${added === 1 ? "item" : "items"}`)
  if (toppedUp) parts.push(`topped up ${toppedUp}`)
  if (alreadyOnList) parts.push(`${alreadyOnList} already on the list`)
  if (parts.length === 0) return "Nothing to add"
  const text = parts.join(", ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
