import { describe, expect, it } from "vitest"

import type { MergeDeps } from "@/features/pantry/merge"

import { draftsFromListItems, mergeHints } from "./put-away"
import type { ListItem } from "./types"

const deps: MergeDeps = {
  normalize: (name) => name.trim().toLowerCase().replace(/s$/, ""),
  convert: (quantity, from, to) => (from === to ? quantity : from === "oz" && to === "lb" ? quantity / 16 : null),
}

function item(id: string, name: string, quantity: number | null, unit: string | null, extra: Partial<ListItem> = {}): ListItem {
  return {
    id, household_id: "h", name, quantity, unit, category: "meat", ingredient_id: null, note: null, recipe_id: null,
    recipe_title: null, checked_at: "2026-09-29T12:00:00Z", checked_by: null, added_by: null,
    created_at: "2026-09-29T10:00:00Z", updated_at: "2026-09-29T10:00:00Z", ...extra,
  }
}

describe("put away", () => {
  it("pre-fills drafts from the list lines", () => {
    const [draft] = draftsFromListItems([item("l1", "chicken", 1.5, "lb", { ingredient_id: 5006 })])
    expect(draft).toMatchObject({ key: "l1", name: "chicken", quantity: "1.5", unit: "lb", category: "meat", ingredientId: 5006, expiresOn: "" })
    expect(draftsFromListItems([item("l2", "limes", 3, null)])[0].unit).toBe("count")
    expect(draftsFromListItems([item("l3", "salt", null, null)])[0].quantity).toBe("")
  })

  it("notes which ones top up the pantry or are already on hand", () => {
    const drafts = draftsFromListItems([item("a", "chicken", 8, "oz"), item("b", "salt", null, null), item("c", "kale", 1, null)])
    const hints = mergeHints(
      drafts,
      [
        { id: "p1", name: "chicken", quantity: 1, unit: "lb", ingredient_id: null },
        { id: "p2", name: "salt", quantity: null, unit: "count", ingredient_id: null },
      ],
      deps,
    )
    expect(hints.get("a")).toBe("Adds to your chicken (1 lb now)")
    expect(hints.get("b")).toBe("Already on hand, so it won't be added again")
    expect(hints.has("c")).toBe(false)
  })

  it("skips drafts that don't validate yet", () => {
    const drafts = draftsFromListItems([item("a", "chicken", 1, "lb")]).map((d) => ({ ...d, quantity: "lots" }))
    expect(mergeHints(drafts, [{ id: "p1", name: "chicken", quantity: 1, unit: "lb", ingredient_id: null }], deps).size).toBe(0)
  })
})
