import { describe, expect, it, vi } from "vitest"

import type { Tables } from "@/types/database"

// Deterministic amounts, independent of the real unit formatter.
vi.mock("@/lib/units", () => ({
  formatQuantity: (quantity: number | null, unit: string) =>
    quantity === null ? "" : unit === "count" ? String(quantity) : `${quantity} ${unit}`,
}))

import {
  cookedRecipe,
  describeItem,
  describeUpdate,
  groupActivity,
  mergeActivityRows,
  resolveActor,
  rowFromRecord,
  summarizeEntry,
  visibleItemCount,
  type ActivityMember,
  type ActivityRow,
} from "./feed"

const ALEX = "00000000-0000-0000-0000-00000000000a"
const BLAIR = "00000000-0000-0000-0000-00000000000b"

let nextId = 1
function row(partial: Partial<ActivityRow> = {}): ActivityRow {
  const id = partial.id ?? nextId++
  return {
    id,
    actorId: ALEX,
    actor: null,
    action: "added",
    itemName: "milk",
    quantity: null,
    unit: "count",
    batchId: 1,
    details: {},
    createdAt: "2026-09-28T12:00:00.000000+00:00",
    ...partial,
  }
}

const members = new Map<string, ActivityMember>([
  [ALEX, { userId: ALEX, displayName: "Alex", avatarUrl: "https://example.com/a.png" }],
  [BLAIR, { userId: BLAIR, displayName: "Blair", avatarUrl: null }],
])

describe("groupActivity", () => {
  it("merges consecutive rows from the same batch and actor, listing items in the order added", () => {
    const rows = [
      row({ id: 13, batchId: 7 }),
      row({ id: 12, batchId: 7 }),
      row({ id: 11, batchId: 7 }),
      row({ id: 10, batchId: 6, actorId: BLAIR }),
    ]
    const entries = groupActivity(rows)
    expect(entries.map((e) => e.rows.map((r) => r.id))).toEqual([[11, 12, 13], [10]])
    expect(entries[0]).toMatchObject({ batchId: 7, actorId: ALEX, key: `7:${ALEX}:11` })
  })

  it("keeps different actors and non-consecutive rows of a batch apart", () => {
    const entries = groupActivity([
      row({ id: 4, batchId: 2, actorId: ALEX }),
      row({ id: 3, batchId: 2, actorId: BLAIR }),
      row({ id: 2, batchId: 1 }),
      row({ id: 1, batchId: 2, actorId: ALEX }),
    ])
    expect(entries.map((e) => e.rows.map((r) => r.id))).toEqual([[4], [3], [2], [1]])
  })

  it("uses the newest row's time for the entry", () => {
    const [entry] = groupActivity([
      row({ id: 2, createdAt: "2026-09-28T12:00:05Z" }),
      row({ id: 1, createdAt: "2026-09-28T12:00:00Z" }),
    ])
    expect(entry.createdAt).toBe("2026-09-28T12:00:05Z")
  })
})

describe("mergeActivityRows", () => {
  it("puts live rows on top, drops duplicates and keeps the joined profile", () => {
    const loaded = [
      row({ id: 2, batchId: 5, actor: { name: "Alex", avatarUrl: null }, createdAt: "2026-09-28T10:00:00Z" }),
      row({ id: 1, batchId: 4, createdAt: "2026-09-28T09:00:00Z" }),
    ]
    const live = [
      row({ id: 3, batchId: 5, createdAt: "2026-09-28T10:00:00Z" }),
      row({ id: 2, batchId: 5, createdAt: "2026-09-28T10:00:00Z" }),
    ]
    const merged = mergeActivityRows(loaded, live)
    expect(merged.map((r) => r.id)).toEqual([3, 2, 1])
    expect(merged[1].actor).toEqual({ name: "Alex", avatarUrl: null })

    // A live row from the same request joins the latest entry instead of starting a new one.
    expect(groupActivity(merged).map((e) => e.rows.map((r) => r.id))).toEqual([[2, 3], [1]])
  })

  it("caps the list", () => {
    const rows = Array.from({ length: 5 }, (_, i) => row({ id: 100 + i, batchId: 100 + i }))
    expect(mergeActivityRows(rows, [], 3).map((r) => r.id)).toEqual([104, 103, 102])
  })
})

describe("rowFromRecord", () => {
  it("maps a broadcast row", () => {
    const record: Tables<"activity_log"> = {
      id: 9,
      household_id: "h",
      actor_id: BLAIR,
      action: "used",
      item_name: "eggs",
      quantity: 2,
      unit: "count",
      batch_id: 555,
      details: {},
      created_at: "2026-09-28T12:00:00Z",
    }
    expect(rowFromRecord(record)).toEqual({
      id: 9,
      actorId: BLAIR,
      actor: null,
      action: "used",
      itemName: "eggs",
      quantity: 2,
      unit: "count",
      batchId: 555,
      details: {},
      createdAt: "2026-09-28T12:00:00Z",
    })
  })
})

describe("resolveActor", () => {
  it("says You for the viewer but keeps their name for the avatar", () => {
    expect(resolveActor({ actorId: ALEX, actor: null }, ALEX, members)).toEqual({
      label: "You",
      name: "Alex",
      avatarUrl: "https://example.com/a.png",
      isViewer: true,
    })
  })

  it("names live rows from the members list and prefers the joined profile", () => {
    expect(resolveActor({ actorId: BLAIR, actor: null }, ALEX, members).label).toBe("Blair")
    expect(resolveActor({ actorId: BLAIR, actor: { name: "Blair B.", avatarUrl: null } }, ALEX, members).label).toBe(
      "Blair B.",
    )
  })

  it("has stand-ins for people it can't see", () => {
    expect(resolveActor({ actorId: "gone", actor: null }, ALEX, members).label).toBe("A former housemate")
    expect(resolveActor({ actorId: null, actor: null }, ALEX, members).label).toBe("Someone")
  })
})

describe("cooked entries", () => {
  const details = { recipe_id: 715538, recipe_title: "Chicken Tikka Masala" }

  it("reads as cooking the recipe, with the amounts it used listed", () => {
    const rows = [
      row({ action: "cooked", itemName: "chicken breast", quantity: 1, unit: "lb", batchId: 9, details }),
      row({ action: "cooked", itemName: "rice", quantity: 2, unit: "cup", batchId: 9, details }),
    ]
    const [entry] = groupActivity(rows)
    expect(summarizeEntry(entry)).toMatchObject({ action: "cooked", verb: "cooked", object: "Chicken Tikka Masala", grouped: true })
    expect(entry.rows.map(describeItem)).toEqual(["1 lb chicken breast", "2 cup rice"])
  })

  it("still reads as cooking for a single item", () => {
    const [entry] = groupActivity([row({ action: "cooked", itemName: "eggs", quantity: 2, batchId: 10, details })])
    expect(summarizeEntry(entry)).toMatchObject({ verb: "cooked", object: "Chicken Tikka Masala", grouped: true })
  })

  it("knows which recipe it was, from Spoonacular or our own library", () => {
    expect(cookedRecipe({ action: "cooked", details })).toEqual({ id: "715538", title: "Chicken Tikka Masala" })
    const local = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    expect(cookedRecipe({ action: "cooked", details: { local_recipe_id: local, recipe_title: "Pancakes" } })).toEqual({
      id: local,
      title: "Pancakes",
    })
    expect(cookedRecipe({ action: "cooked", details: { local_recipe_id: "../x", recipe_title: "Odd" } })).toEqual({ id: null, title: "Odd" })
  })
})

describe("shopping trip entries", () => {
  it("reads as buying the items, with amounts", () => {
    const rows = [
      row({ action: "shopped", itemName: "eggs", quantity: 12, unit: "count", batchId: 11 }),
      row({ action: "shopped", itemName: "milk", quantity: null, unit: "count", batchId: 11 }),
    ]
    const [entry] = groupActivity(rows)
    expect(summarizeEntry(entry)).toMatchObject({ action: "shopped", verb: "bought", object: "2 items", grouped: true, mixed: false })
    expect(entry.rows.map(describeItem)).toEqual(["12 eggs", "milk"])
  })

  it("names a single item", () => {
    const [entry] = groupActivity([row({ action: "shopped", itemName: "rice", quantity: 2, unit: "lb", batchId: 12 })])
    expect(summarizeEntry(entry)).toMatchObject({ verb: "bought", object: "2 lb rice", grouped: false })
  })
})

describe("summarizeEntry", () => {
  const sentence =(rows: ActivityRow[], viewerId = "someone-else") => {
    const [entry] = groupActivity(rows)
    const s = summarizeEntry(entry)
    return `${resolveActor(entry.rows[0], viewerId, members).label} ${s.verb} ${s.object}`
  }

  it("describes single rows", () => {
    expect(sentence([row({ action: "used", itemName: "eggs", quantity: 2, unit: "count" })])).toBe("Alex used 2 eggs")
    expect(
      sentence([row({ actorId: BLAIR, action: "added", itemName: "chicken breast", quantity: 2, unit: "lb" })]),
    ).toBe("Blair added 2 lb chicken breast")
    expect(sentence([row({ action: "removed", itemName: "milk", quantity: 1, unit: "gal" })])).toBe("Alex removed milk")
    expect(sentence([row({ action: "updated", itemName: "rice" })])).toBe("Alex updated rice")
    expect(sentence([row({ action: "restocked", itemName: "eggs", quantity: 6 })])).toBe("Alex restocked 6 eggs")
    expect(sentence([row({ action: "added", itemName: "salt", quantity: null })])).toBe("Alex added salt")
    expect(sentence([row({ action: "used", itemName: "eggs", quantity: 2 })], ALEX)).toBe("You used 2 eggs")
  })

  it("counts items in a batch", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ id: 200 - i, batchId: 9, itemName: `item ${i}` }))
    const summary = summarizeEntry(groupActivity(rows)[0])
    expect(summary).toMatchObject({ action: "added", verb: "added", object: "12 items", grouped: true, mixed: false })
    expect(sentence(rows)).toBe("Alex added 12 items")
  })

  it("reads a shopping trip that topped up some items as 'added'", () => {
    const rows = [
      row({ id: 303, batchId: 3, action: "restocked" }),
      row({ id: 302, batchId: 3, action: "added" }),
      row({ id: 301, batchId: 3, action: "added" }),
    ]
    expect(summarizeEntry(groupActivity(rows)[0])).toMatchObject({ verb: "added", object: "3 items", mixed: true })
  })

  it("spells out other mixes", () => {
    const rows = [
      row({ id: 404, batchId: 4, action: "removed" }),
      row({ id: 403, batchId: 4, action: "used" }),
      row({ id: 402, batchId: 4, action: "used" }),
      row({ id: 401, batchId: 4, action: "used" }),
    ]
    expect(sentence(rows)).toBe("Alex used 3 items and removed 1")
    const three = [...rows, row({ id: 400, batchId: 4, action: "updated" })]
    expect(sentence(three)).toBe("Alex used 3 items, updated 1 and removed 1")
  })

  it("explains renames", () => {
    const renamed = row({ action: "updated", itemName: "rice", details: { before: { name: "white rice" } } })
    expect(summarizeEntry({ rows: [renamed] }).detail).toBe("Renamed from “white rice”")
    expect(describeUpdate({ ...renamed, details: { before: { name: "Rice" } } })).toBeNull()
    expect(describeUpdate({ ...renamed, details: {} })).toBeNull()
  })
})

describe("describeItem", () => {
  it("shows amounts only for added, used and restocked", () => {
    expect(describeItem({ action: "added", itemName: "flour", quantity: 5, unit: "lb" })).toBe("5 lb flour")
    expect(describeItem({ action: "removed", itemName: "flour", quantity: 5, unit: "lb" })).toBe("flour")
    expect(describeItem({ action: "used", itemName: "flour", quantity: null, unit: "lb" })).toBe("flour")
  })
})

describe("visibleItemCount", () => {
  it("collapses after four, but never hides just one", () => {
    expect(visibleItemCount(3)).toBe(3)
    expect(visibleItemCount(5)).toBe(5)
    expect(visibleItemCount(6)).toBe(4)
    expect(visibleItemCount(12)).toBe(4)
  })
})
