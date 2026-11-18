import { describe, expect, it } from "vitest"

import {
  applyOverrides,
  applyPantryChange,
  beginAdjust,
  changeFromBroadcast,
  endAdjust,
  indexItems,
  initialPantryState,
  normalizeItem,
  reducePantry,
} from "./pantry-state"
import type { PantryItem } from "./types"

function item(id: string, extra: Partial<PantryItem> = {}): PantryItem {
  return {
    id,
    household_id: "h1",
    name: `item ${id}`,
    quantity: 1,
    unit: "count",
    category: "other",
    expires_on: null,
    is_staple: false,
    ingredient_id: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-09-28T10:00:00+00:00",
    updated_at: "2026-09-28T10:00:00+00:00",
    ...extra,
  }
}

describe("normalizeItem / indexItems", () => {
  it("turns numeric strings into numbers", () => {
    const raw = item("a", { quantity: "2.5" as unknown as number, ingredient_id: "5062" as unknown as number })
    expect(normalizeItem(raw)).toMatchObject({ quantity: 2.5, ingredient_id: 5062 })
    expect(indexItems([raw]).get("a")?.quantity).toBe(2.5)
  })

  it("keeps the same object when nothing needs fixing", () => {
    const clean = item("a")
    expect(normalizeItem(clean)).toBe(clean)
  })
})

describe("applyPantryChange", () => {
  const items = indexItems([item("a"), item("b", { quantity: 6 })])

  it("adds and replaces rows without touching the original map", () => {
    const added = applyPantryChange(items, { type: "upsert", item: item("c") })
    expect([...added.keys()]).toEqual(["a", "b", "c"])
    expect(items.has("c")).toBe(false)

    const newer = item("b", { quantity: 5, updated_at: "2026-09-28T10:05:00+00:00" })
    expect(applyPantryChange(items, { type: "upsert", item: newer }).get("b")?.quantity).toBe(5)
  })

  it("ignores a broadcast that's older than what we have", () => {
    const older = item("b", { quantity: 9, updated_at: "2026-09-28T09:00:00+00:00" })
    expect(applyPantryChange(items, { type: "upsert", item: older })).toBe(items)
  })

  it("patches and removes, and no-ops for unknown ids", () => {
    expect(applyPantryChange(items, { type: "patch", id: "b", fields: { quantity: 4 } }).get("b")?.quantity).toBe(4)
    expect(applyPantryChange(items, { type: "patch", id: "zz", fields: { quantity: 4 } })).toBe(items)
    expect([...applyPantryChange(items, { type: "remove", id: "a" }).keys()]).toEqual(["b"])
    expect(applyPantryChange(items, { type: "remove", id: "zz" })).toBe(items)
  })
})

describe("changeFromBroadcast", () => {
  it("upserts inserts and updates for this household", () => {
    const record = item("a")
    expect(changeFromBroadcast({ operation: "INSERT", record, oldRecord: null }, "h1")).toEqual({ type: "upsert", item: record })
    expect(changeFromBroadcast({ operation: "UPDATE", record, oldRecord: record }, "h1")).toEqual({ type: "upsert", item: record })
    expect(changeFromBroadcast({ operation: "INSERT", record, oldRecord: null }, "h2")).toBeNull()
  })

  it("removes deleted rows", () => {
    expect(changeFromBroadcast({ operation: "DELETE", record: null, oldRecord: item("a") }, "h1")).toEqual({
      type: "remove",
      id: "a",
    })
    expect(changeFromBroadcast({ operation: "DELETE", record: null, oldRecord: null }, "h1")).toBeNull()
    expect(changeFromBroadcast({ operation: "DELETE", record: null, oldRecord: item("a") }, "h2")).toBeNull()
  })
})

describe("reducePantry", () => {
  const state = initialPantryState([item("a"), item("b", { quantity: 6 })])
  const fetchedAt = Date.parse("2026-09-28T10:10:00+00:00")

  it("takes a fresh snapshot, keeping rows that are newer than it", () => {
    const live = reducePantry(state, {
      type: "upsert",
      item: item("b", { quantity: 5, updated_at: "2026-09-28T10:20:00+00:00" }),
    })
    const synced = reducePantry(live, {
      type: "sync",
      items: [item("a", { quantity: 3, updated_at: "2026-09-28T10:05:00+00:00" }), item("b", { quantity: 6 })],
      fetchedAt,
    })
    expect(synced.items.get("a")?.quantity).toBe(3)
    expect(synced.items.get("b")?.quantity).toBe(5)
  })

  it("drops rows the snapshot no longer has, unless they just arrived", () => {
    const live = reducePantry(state, {
      type: "upsert",
      item: item("c", { created_at: "2026-09-28T10:10:05+00:00", updated_at: "2026-09-28T10:10:05+00:00" }),
    })
    const synced = reducePantry(live, { type: "sync", items: [item("b")], fetchedAt })
    expect([...synced.items.keys()].sort()).toEqual(["b", "c"])
  })

  it("never brings a deleted row back", () => {
    const removed = reducePantry(state, { type: "remove", id: "a" })
    expect(removed.items.has("a")).toBe(false)
    expect(reducePantry(removed, { type: "upsert", item: item("a", { updated_at: "2026-09-28T11:00:00+00:00" }) })).toBe(
      removed,
    )
    const synced = reducePantry(removed, { type: "sync", items: [item("a"), item("b")], fetchedAt })
    expect([...synced.items.keys()]).toEqual(["b"])
  })

  it("keeps the same state when nothing changes", () => {
    expect(reducePantry(state, { type: "patch", id: "zz", fields: { quantity: 1 } })).toBe(state)
    const removed = reducePantry(state, { type: "remove", id: "zz" })
    expect(reducePantry(removed, { type: "remove", id: "zz" })).toBe(removed)
  })
})

describe("quantity overrides", () => {
  const items = indexItems([item("a", { quantity: 6 }), item("b")])

  it("shows the running total until the last request finishes", () => {
    let overrides = beginAdjust(new Map(), "a", 5)
    overrides = beginAdjust(overrides, "a", 4)
    // A broadcast of the first tap lands meanwhile: still shows 4.
    const live = applyPantryChange(items, { type: "patch", id: "a", fields: { quantity: 5 } })
    expect(applyOverrides(live, overrides).get("a")?.quantity).toBe(4)

    overrides = endAdjust(overrides, "a")
    expect(overrides.get("a")).toEqual({ quantity: 4, inFlight: 1 })
    overrides = endAdjust(overrides, "a")
    expect(overrides.size).toBe(0)
    expect(applyOverrides(live, overrides)).toBe(live)
  })

  it("never goes below zero and ignores unknown items", () => {
    const overrides = beginAdjust(beginAdjust(new Map(), "a", -2), "zz", 1)
    const shown = applyOverrides(items, overrides)
    expect(shown.get("a")?.quantity).toBe(0)
    expect(shown.has("zz")).toBe(false)
    expect(endAdjust(new Map(), "a").size).toBe(0)
  })
})
