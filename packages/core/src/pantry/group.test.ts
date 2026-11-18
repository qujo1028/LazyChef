import { describe, expect, it } from "vitest"

import { groupPantry, isExpiringSoon, matchesQuery } from "./group"
import type { PantryItem } from "./types"

let nextId = 0
function item(name: string, extra: Partial<PantryItem> = {}): PantryItem {
  return {
    id: String(++nextId),
    household_id: "h",
    name,
    quantity: 1,
    unit: "count",
    category: "other",
    expires_on: null,
    is_staple: false,
    ingredient_id: null,
    created_by: null,
    updated_by: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...extra,
  }
}

const today = "2026-09-28"
const names = (items: PantryItem[]) => items.map((i) => i.name)

describe("groupPantry", () => {
  const items = [
    item("yogurt", { category: "dairy", expires_on: "2026-09-30" }),
    item("spinach", { category: "produce", expires_on: "2026-09-27" }),
    item("carrots", { category: "produce", expires_on: "2026-10-10" }),
    item("Apples", { category: "produce" }),
    item("milk", { category: "dairy", expires_on: "2026-10-01" }),
    item("cheddar", { category: "dairy" }),
    item("salt", { is_staple: true, quantity: null, category: "spices" }),
    item("butter", { is_staple: true, quantity: 0, category: "dairy", expires_on: "2026-09-01" }),
    item("eggs", { category: "dairy", quantity: 0, expires_on: "2026-09-20" }),
    item("rice", { category: "grains", quantity: null }),
  ]
  const sections = groupPantry(items, today)

  it("puts expired and soon-to-expire items first, soonest first", () => {
    expect(names(sections.expiring)).toEqual(["spinach", "yogurt", "milk"])
  })

  it("groups the rest by category in store order, sorted by name", () => {
    expect(sections.categories.map((g) => [g.category, names(g.items)])).toEqual([
      ["produce", ["Apples", "carrots"]],
      ["dairy", ["cheddar"]],
      ["grains", ["rice"]],
    ])
  })

  it("keeps staples together whatever their amount or date", () => {
    expect(names(sections.staples)).toEqual(["butter", "salt"])
  })

  it("puts items at zero in ran out, even if expired", () => {
    expect(names(sections.ranOut)).toEqual(["eggs"])
  })

  it("counts every item once", () => {
    expect(sections.total).toBe(items.length)
  })

  it("filters by name, case-insensitively", () => {
    const filtered = groupPantry(items, today, " MIL ")
    expect(filtered.total).toBe(1)
    expect(names(filtered.expiring)).toEqual(["milk"])
    expect(filtered.categories).toEqual([])
  })
})

describe("helpers", () => {
  it("isExpiringSoon covers expired and the next 3 days", () => {
    expect(isExpiringSoon({ expires_on: "2026-09-01" }, today)).toBe(true)
    expect(isExpiringSoon({ expires_on: "2026-10-01" }, today)).toBe(true)
    expect(isExpiringSoon({ expires_on: "2026-10-02" }, today)).toBe(false)
    expect(isExpiringSoon({ expires_on: null }, today)).toBe(false)
  })

  it("matchesQuery ignores blank queries", () => {
    expect(matchesQuery("Olive oil", "")).toBe(true)
    expect(matchesQuery("Olive oil", "OIL")).toBe(true)
    expect(matchesQuery("Olive oil", "butter")).toBe(false)
  })
})
