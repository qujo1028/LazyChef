// Pure: client state for a live list of database rows (the pantry, the shopping list).
// Rows are keyed by id and changed by server responses, housemates' live row changes
// and optimistic updates alike. Each list passes its own `normalize` (Postgres numerics
// can arrive as strings).

/** What every live row has. */
export type LiveRow = { id: string; household_id: string; updated_at: string }

export type Rows<T> = ReadonlyMap<string, T>

export type RowChange<T> =
  /** A full row from the server or a live broadcast. Ignored if it's older than what we have. */
  | { type: "upsert"; item: T }
  /** Some fields of a row we already have (an optimistic edit, or an action's result). */
  | { type: "patch"; id: string; fields: Partial<T> }
  | { type: "remove"; id: string }

/** A row change broadcast by the database (see useHouseholdChanges). */
export type RowBroadcast<T> = {
  operation: "INSERT" | "UPDATE" | "DELETE"
  record: T | null
  oldRecord: T | null
}

/** A fresh server render of the whole list. `fetchedAt` is when it was read (ms). */
export type RowSync<T> = { type: "sync"; items: readonly T[]; fetchedAt: number }

/**
 * The list's state: the rows, plus ids we know were deleted. Ids are never reused, so a
 * deleted id showing up again can only be a stale snapshot or a late broadcast.
 */
export type RowState<T> = { items: Rows<T>; deleted: ReadonlySet<string> }

/**
 * Rows only we have are kept if they changed this close to (or after) the snapshot:
 * they probably arrived live while it was being read. Older ones were deleted.
 */
export const SYNC_GRACE_MS = 10_000

export type Normalize<T> = (row: T) => T

/** "2" → 2, null stays null, junk → null. */
export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function time(iso: string): number {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? 0 : ms
}

export function indexRows<T extends LiveRow>(items: Iterable<T>, normalize: Normalize<T>): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) map.set(item.id, normalize(item))
  return map
}

/** Returns `items` itself when nothing changes, so React can skip the re-render. */
export function applyRowChange<T extends LiveRow>(items: Rows<T>, change: RowChange<T>, normalize: Normalize<T>): Rows<T> {
  switch (change.type) {
    case "upsert": {
      const item = normalize(change.item)
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
      next.set(change.id, normalize({ ...current, ...change.fields }))
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
export function rowChangeFromBroadcast<T extends LiveRow>(broadcast: RowBroadcast<T>, householdId: string): RowChange<T> | null {
  if (broadcast.operation === "DELETE") {
    const old = broadcast.oldRecord
    if (!old || (old.household_id && old.household_id !== householdId)) return null
    return { type: "remove", id: old.id }
  }
  const record = broadcast.record
  if (!record || record.household_id !== householdId) return null
  return { type: "upsert", item: record }
}

export function initialRowState<T extends LiveRow>(items: Iterable<T>, normalize: Normalize<T>): RowState<T> {
  return { items: indexRows(items, normalize), deleted: new Set() }
}

/** Server snapshots merged with what we already know; newer rows win either way. */
function syncRows<T extends LiveRow>(state: RowState<T>, sync: RowSync<T>, normalize: Normalize<T>): Rows<T> {
  const next = new Map<string, T>()
  for (const raw of sync.items) {
    if (state.deleted.has(raw.id)) continue
    const item = normalize(raw)
    const mine = state.items.get(item.id)
    next.set(item.id, mine && time(mine.updated_at) > time(item.updated_at) ? mine : item)
  }
  for (const [id, mine] of state.items) {
    if (!next.has(id) && time(mine.updated_at) > sync.fetchedAt - SYNC_GRACE_MS) next.set(id, mine)
  }
  return next
}

/** Returns `state` itself when nothing changes. */
export function reduceRows<T extends LiveRow>(
  state: RowState<T>,
  change: RowChange<T> | RowSync<T>,
  normalize: Normalize<T>,
): RowState<T> {
  switch (change.type) {
    case "sync":
      return { ...state, items: syncRows(state, change, normalize) }
    case "remove": {
      const items = applyRowChange(state.items, change, normalize)
      if (items === state.items && state.deleted.has(change.id)) return state
      return { items, deleted: new Set(state.deleted).add(change.id) }
    }
    case "upsert":
    case "patch": {
      if (change.type === "upsert" && state.deleted.has(change.item.id)) return state
      const items = applyRowChange(state.items, change, normalize)
      return items === state.items ? state : { ...state, items }
    }
  }
}

/**
 * Values shown while requests are in flight. Live rows and snapshots can carry in-between
 * values (after the first of three taps, say), so while any request for a row is pending,
 * the list shows our own latest value instead.
 */
export type Overrides<V> = ReadonlyMap<string, { value: V; inFlight: number }>

/** Starts a request: `value` is what the row should show now. */
export function beginOverride<V>(overrides: Overrides<V>, id: string, value: V): Overrides<V> {
  const next = new Map(overrides)
  next.set(id, { value, inFlight: (overrides.get(id)?.inFlight ?? 0) + 1 })
  return next
}

/** One request finished; the override goes away when the last one does. */
export function endOverride<V>(overrides: Overrides<V>, id: string): Overrides<V> {
  const current = overrides.get(id)
  if (!current) return overrides
  const next = new Map(overrides)
  if (current.inFlight <= 1) next.delete(id)
  else next.set(id, { ...current, inFlight: current.inFlight - 1 })
  return next
}

/** The rows with each override applied by `apply`. Returns `items` itself when there are none. */
export function applyRowOverrides<T, V>(items: Rows<T>, overrides: Overrides<V>, apply: (row: T, value: V) => T): Rows<T> {
  if (overrides.size === 0) return items
  const next = new Map(items)
  for (const [id, { value }] of overrides) {
    const item = items.get(id)
    if (item) next.set(id, apply(item, value))
  }
  return next
}
