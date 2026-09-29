// Pure: the pantry list's client state. Items keyed by id, changed by server
// responses, housemates' live row changes and optimistic updates alike.
import type { PantryItem } from "./types"

export type PantryItems = ReadonlyMap<string, PantryItem>

export type PantryChange =
  /** A full row from the server or a live broadcast. Ignored if it's older than what we have. */
  | { type: "upsert"; item: PantryItem }
  /** Some fields of an item we already have (an optimistic edit, or an action's result). */
  | { type: "patch"; id: string; fields: Partial<PantryItem> }
  | { type: "remove"; id: string }

/** A row change broadcast by the database (see useHouseholdChanges). */
export type PantryBroadcast = {
  operation: "INSERT" | "UPDATE" | "DELETE"
  record: PantryItem | null
  oldRecord: PantryItem | null
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** Postgres numerics can arrive as strings (JSON), the list wants numbers. */
export function normalizeItem(item: PantryItem): PantryItem {
  const quantity = toNumber(item.quantity)
  const ingredientId = toNumber(item.ingredient_id)
  if (quantity === item.quantity && ingredientId === item.ingredient_id) return item
  return { ...item, quantity, ingredient_id: ingredientId }
}

export function indexItems(items: Iterable<PantryItem>): Map<string, PantryItem> {
  const map = new Map<string, PantryItem>()
  for (const item of items) map.set(item.id, normalizeItem(item))
  return map
}

function time(iso: string): number {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? 0 : ms
}

/** Returns `items` itself when nothing changes, so React can skip the re-render. */
export function applyPantryChange(items: PantryItems, change: PantryChange): PantryItems {
  switch (change.type) {
    case "upsert": {
      const item = normalizeItem(change.item)
      const current = items.get(item.id)
      // A late broadcast must not undo a newer row we already have.
      if (current && time(current.updated_at) > time(item.updated_at)) return items
      const next = new Map(items)
      next.set(item.id, item)
      return next
    }
    case "patch": {
      const current = items.get(change.id)
      if (!current) return items
      const next = new Map(items)
      next.set(change.id, normalizeItem({ ...current, ...change.fields }))
      return next
    }
    case "remove": {
      if (!items.has(change.id)) return items
      const next = new Map(items)
      next.delete(change.id)
      return next
    }
  }
}

/** A broadcast as a change for this household's list, or null if it isn't one. */
export function changeFromBroadcast(broadcast: PantryBroadcast, householdId: string): PantryChange | null {
  if (broadcast.operation === "DELETE") {
    const old = broadcast.oldRecord
    if (!old || (old.household_id && old.household_id !== householdId)) return null
    return { type: "remove", id: old.id }
  }
  const record = broadcast.record
  if (!record || record.household_id !== householdId) return null
  return { type: "upsert", item: record }
}

/**
 * The list's state: the items, plus ids we know were deleted. Ids are never reused, so a
 * deleted id showing up again can only be a stale snapshot or a late broadcast.
 */
export type PantryState = { items: PantryItems; deleted: ReadonlySet<string> }

/** A fresh server render of the whole pantry. `fetchedAt` is when it was read (ms). */
export type PantrySync = { type: "sync"; items: readonly PantryItem[]; fetchedAt: number }

/**
 * Rows only we have are kept if they changed this close to (or after) the snapshot:
 * they probably arrived live while it was being read. Older ones were deleted.
 */
export const SYNC_GRACE_MS = 10_000

export function initialPantryState(items: Iterable<PantryItem>): PantryState {
  return { items: indexItems(items), deleted: new Set() }
}

/** Server snapshots merged with what we already know; newer rows win either way. */
function syncItems(state: PantryState, sync: PantrySync): PantryItems {
  const next = new Map<string, PantryItem>()
  for (const raw of sync.items) {
    if (state.deleted.has(raw.id)) continue
    const item = normalizeItem(raw)
    const mine = state.items.get(item.id)
    next.set(item.id, mine && time(mine.updated_at) > time(item.updated_at) ? mine : item)
  }
  for (const [id, mine] of state.items) {
    if (!next.has(id) && time(mine.updated_at) > sync.fetchedAt - SYNC_GRACE_MS) next.set(id, mine)
  }
  return next
}

/** Returns `state` itself when nothing changes. */
export function reducePantry(state: PantryState, change: PantryChange | PantrySync): PantryState {
  switch (change.type) {
    case "sync":
      return { ...state, items: syncItems(state, change) }
    case "remove": {
      const items = applyPantryChange(state.items, change)
      if (items === state.items && state.deleted.has(change.id)) return state
      return { items, deleted: new Set(state.deleted).add(change.id) }
    }
    case "upsert":
    case "patch": {
      if (change.type === "upsert" && state.deleted.has(change.item.id)) return state
      const items = applyPantryChange(state.items, change)
      return items === state.items ? state : { ...state, items }
    }
  }
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
