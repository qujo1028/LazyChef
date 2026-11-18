import { describe, expect, it } from "vitest"

import { amountText, checkedByLabel, listUnit } from "./display"
import { groupList, listSummary } from "./group"
import { applyChecked, beginCheck, endCheck, initialListState, listChangeFromBroadcast, reduceList } from "./list-state"
import type { ListItem } from "./types"

function item(id: string, name: string, extra: Partial<ListItem> = {}): ListItem {
  return {
    id,
    household_id: "h",
    name,
    quantity: null,
    unit: null,
    category: "other",
    ingredient_id: null,
    note: null,
    recipe_id: null,
    recipe_title: null,
    checked_at: null,
    checked_by: null,
    added_by: null,
    created_at: "2026-09-29T10:00:00Z",
    updated_at: "2026-09-29T10:00:00Z",
    ...extra,
  }
}

describe("list state", () => {
  it("turns numeric strings into numbers", () => {
    const state = initialListState([item("a", "milk", { quantity: "2" as unknown as number, recipe_id: "7" as unknown as number })])
    expect(state.items.get("a")).toMatchObject({ quantity: 2, recipe_id: 7 })
  })

  it("ignores older broadcasts and remembers deletions", () => {
    let state = initialListState([item("a", "milk", { updated_at: "2026-09-29T10:05:00Z" })])
    const old = listChangeFromBroadcast({ operation: "UPDATE", record: item("a", "old milk"), oldRecord: null }, "h")!
    expect(reduceList(state, old)).toBe(state)
    state = reduceList(state, { type: "remove", id: "a" })
    const back = listChangeFromBroadcast({ operation: "INSERT", record: item("a", "milk", { updated_at: "2026-09-29T11:00:00Z" }), oldRecord: null }, "h")!
    expect(reduceList(state, back).items.size).toBe(0)
    expect(listChangeFromBroadcast({ operation: "INSERT", record: item("b", "x", { household_id: "other" }), oldRecord: null }, "h")).toBeNull()
  })

  it("shows our own check while it's in flight, whatever arrives meanwhile", () => {
    const items = initialListState([item("a", "milk", { checked_at: null })]).items
    let overrides = beginCheck(new Map(), "a", "2026-09-29T12:00:00Z")
    expect(applyChecked(items, overrides, "me").get("a")).toMatchObject({ checked_at: "2026-09-29T12:00:00Z", checked_by: "me" })
    overrides = beginCheck(overrides, "a", null)
    expect(applyChecked(items, overrides, "me").get("a")?.checked_at).toBeNull()
    overrides = endCheck(endCheck(overrides, "a"), "a")
    expect(applyChecked(items, overrides, "me")).toBe(items)
  })
})

describe("groupList", () => {
  it("groups what's left to buy in store order, and the cart newest first", () => {
    const sections = groupList([
      item("1", "Milk", { category: "dairy" }),
      item("2", "apples", { category: "produce" }),
      item("3", "bananas", { category: "produce" }),
      item("4", "salt", { category: "spices", checked_at: "2026-09-29T12:00:00Z" }),
      item("5", "eggs", { category: "dairy", checked_at: "2026-09-29T12:05:00Z" }),
    ])
    expect(sections.toBuy.map((s) => [s.category, s.items.map((i) => i.name)])).toEqual([
      ["produce", ["apples", "bananas"]],
      ["dairy", ["Milk"]],
    ])
    expect(sections.inCart.map((i) => i.name)).toEqual(["eggs", "salt"])
    expect(sections.toBuyCount).toBe(3)
  })

  it("summarizes", () => {
    expect(listSummary(0, 0)).toBe("Shared with everyone in your household.")
    expect(listSummary(5, 2)).toBe("5 to buy · 2 in the cart")
    expect(listSummary(0, 2)).toBe("All done · 2 in the cart")
  })
})

describe("display", () => {
  it("formats amounts and units", () => {
    expect(amountText({ quantity: null, unit: null })).toBe("")
    expect(amountText({ quantity: 3, unit: null })).toBe("3")
    expect(amountText({ quantity: 2, unit: "lb" })).toBe("2 lb")
    expect(listUnit("count")).toBeNull()
    expect(listUnit(" lb ")).toBe("lb")
  })

  it("says who checked it", () => {
    const members = [{ userId: "u2", displayName: "Sam" }]
    expect(checkedByLabel("me", members, "me")).toBe("Checked by you")
    expect(checkedByLabel("u2", members, "me")).toBe("Checked by Sam")
    expect(checkedByLabel(null, members, "me")).toBe("In the cart")
  })
})
