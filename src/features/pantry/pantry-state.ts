// Pure: the pantry list's client state, on top of the shared row state in
// src/lib/row-state.ts, plus the pantry's own in-flight amount overrides.
import {
  applyRowChange,
  indexRows,
  initialRowState,
  reduceRows,
  rowChangeFromBroadcast,
  toNumber,
  type RowBroadcast,
  type RowChange,
  type RowState,
  type RowSync,
  type Rows,
} from "@/lib/row-state"

import type { PantryItem } from "./types"

export { SYNC_GRACE_MS } from "@/lib/row-state"

export type PantryItems = Rows<PantryItem>

export type PantryChange = RowChange<PantryItem>

/** A row change broadcast by the database (see useHouseholdChanges). */
export type PantryBroadcast = RowBroadcast<PantryItem>

/** Postgres numerics can arrive as strings (JSON), the list wants numbers. */
export function normalizeItem(item: PantryItem): PantryItem {
  const quantity = toNumber(item.quantity)
  const ingredientId = toNumber(item.ingredient_id)
  if (quantity === item.quantity && ingredientId === item.ingredient_id) return item
  return { ...item, quantity, ingredient_id: ingredientId }
}

export function indexItems(items: Iterable<PantryItem>): Map<string, PantryItem> {
  return indexRows(items, normalizeItem)
}

/** Returns `items` itself when nothing changes, so React can skip the re-render. */
export function applyPantryChange(items: PantryItems, change: PantryChange): PantryItems {
  return applyRowChange(items, change, normalizeItem)
}

/** A broadcast as a change for this household's list, or null if it isn't one. */
export function changeFromBroadcast(broadcast: PantryBroadcast, householdId: string): PantryChange | null {
  return rowChangeFromBroadcast(broadcast, householdId)
}

/** The list's state: the items, plus ids we know were deleted (see RowState). */
export type PantryState = RowState<PantryItem>

/** A fresh server render of the whole pantry. `fetchedAt` is when it was read (ms). */
export type PantrySync = RowSync<PantryItem>

export function initialPantryState(items: Iterable<PantryItem>): PantryState {
  return initialRowState(items, normalizeItem)
}

/** Returns `state` itself when nothing changes. */
export function reducePantry(state: PantryState, change: PantryChange | PantrySync): PantryState {
  return reduceRows(state, change, normalizeItem)
}

/**
 * Amounts shown while "−1" / "Used some" requests are in flight. Live rows and snapshots
 * can carry in-between amounts (after the first of three taps, say), so while any request
 * for an item is pending, the list shows our own running total instead.
 */
export type QuantityOverrides = ReadonlyMap<string, { quantity: number; inFlight: number }>

/** Starts an adjustment: `quantity` is what the item should show now. */
export function beginAdjust(overrides: QuantityOverrides, id: string, quantity: number): QuantityOverrides {
  const next = new Map(overrides)
  next.set(id, { quantity: Math.max(0, quantity), inFlight: (overrides.get(id)?.inFlight ?? 0) + 1 })
  return next
}

/** One request finished; the override goes away when the last one does. */
export function endAdjust(overrides: QuantityOverrides, id: string): QuantityOverrides {
  const current = overrides.get(id)
  if (!current) return overrides
  const next = new Map(overrides)
  if (current.inFlight <= 1) next.delete(id)
  else next.set(id, { ...current, inFlight: current.inFlight - 1 })
  return next
}

export function applyOverrides(items: PantryItems, overrides: QuantityOverrides): PantryItems {
  if (overrides.size === 0) return items
  const next = new Map(items)
  for (const [id, { quantity }] of overrides) {
    const item = items.get(id)
    if (item) next.set(id, { ...item, quantity })
  }
  return next
}
