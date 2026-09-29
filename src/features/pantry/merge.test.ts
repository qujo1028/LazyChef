import { describe, expect, it } from "vitest"

import { categoryOverrides, describeAdditions, planAdditions, roundQuantity, type ExistingItem, type MergeDeps } from "./merge"
import type { NewPantryItem } from "./types"

// Stand-ins for normalizeIngredientName / convertQuantity so these tests only
// exercise the merge rules.
const MASS: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 }
const VOLUME: Record<string, number> = { ml: 1, tsp: 4.92892, tbsp: 14.7868, cup: 236.588 }
const deps: MergeDeps = {
  normalize: (name) => name.trim().toLowerCase().replace(/^fresh\s+/, "").replace(/s$/, ""),
  convert: (quantity, from, to) => {
    if (from === to) return quantity
    for (const table of [MASS, VOLUME]) {
      if (from in table && to in table) return (quantity * table[from]) / table[to]
    }
    return null
  },
}

function line(name: string, quantity: number | null, unit = "count", extra: Partial<NewPantryItem> = {}): NewPantryItem {
  return {
    name,
    quantity,
    unit,
    category: "other",
    expires_on: null,
    is_staple: false,
    ingredient_id: null,
    category_changed: false,
    ...extra,
  }
}

function have(id: string, name: string, quantity: number | null, unit = "count", ingredient_id: number | null = null): ExistingItem {
  return { id, name, quantity, unit, ingredient_id }
}

describe("planAdditions", () => {
  it("inserts new items with every field", () => {
    const plan = planAdditions(
      [line("chicken breast", 2, "lb", { category: "meat", expires_on: "2026-10-01", ingredient_id: 5062 })],
      [],
      deps,
    )
    expect(plan).toEqual({
      entries: [
        {
          name: "chicken breast",
          quantity: 2,
          unit: "lb",
          category: "meat",
          expires_on: "2026-10-01",
          is_staple: false,
          ingredient_id: 5062,
        },
      ],
      outcomes: [{ type: "insert" }],
      added: 1,
      toppedUp: 0,
      alreadyOnHand: 0,
    })
  })

  it("tops up an item with the same normalized name", () => {
    const plan = planAdditions([line("Eggs", 6)], [have("a", "egg", 4)], deps)
    expect(plan.entries).toEqual([{ merge_into: "a", quantity: 6, expires_on: null }])
    expect(plan).toMatchObject({ added: 0, toppedUp: 1 })
  })

  it("tops up by ingredient id even when the names differ", () => {
    const plan = planAdditions(
      [line("boneless chicken breast", 1, "lb", { ingredient_id: 5062 })],
      [have("a", "chicken breast", 2, "lb", 5062)],
      deps,
    )
    expect(plan.entries).toEqual([{ merge_into: "a", quantity: 1, expires_on: null }])
  })

  it("converts the amount into the existing item's unit", () => {
    const plan = planAdditions([line("butter", 8, "oz")], [have("a", "butter", 1, "lb")], deps)
    expect(plan.entries).toEqual([{ merge_into: "a", quantity: 0.5, expires_on: null }])
  })

  it("adds a separate row when the units can't be converted", () => {
    const plan = planAdditions([line("flour", 2, "cup")], [have("a", "flour", 5, "lb")], deps)
    expect(plan.entries).toEqual([expect.objectContaining({ name: "flour", quantity: 2, unit: "cup" })])
    expect(plan).toMatchObject({ added: 1, toppedUp: 0 })
  })

  it("never merges into untracked items (staples with no quantity)", () => {
    const plan = planAdditions([line("olive oil", 500, "ml")], [have("a", "olive oil", null, "count")], deps)
    expect(plan.entries).toEqual([expect.objectContaining({ name: "olive oil", quantity: 500, unit: "ml" })])
    expect(plan.added).toBe(1)
  })

  it("tops up items that ran out and passes the new expiry through", () => {
    const plan = planAdditions([line("milk", 1, "cup", { expires_on: "2026-10-05" })], [have("a", "milk", 0, "cup")], deps)
    expect(plan.entries).toEqual([{ merge_into: "a", quantity: 1, expires_on: "2026-10-05" }])
  })

  it("does not match different things", () => {
    const plan = planAdditions([line("oat milk", 1, "cup")], [have("a", "milk", 2, "cup")], deps)
    expect(plan).toMatchObject({ added: 1, toppedUp: 0 })
  })

  it("prefers an ingredient id match, then the same unit", () => {
    const existing = [
      have("by-name-other-unit", "rice", 500, "g"),
      have("by-name-same-unit", "rice", 1, "lb"),
      have("by-id", "jasmine rice", 200, "g", 20444),
    ]
    expect(planAdditions([line("rice", 1, "lb")], existing, deps).entries[0]).toMatchObject({ merge_into: "by-name-same-unit" })
    expect(planAdditions([line("rice", 1, "lb", { ingredient_id: 20444 })], existing, deps).entries[0]).toMatchObject({
      merge_into: "by-id",
    })
  })

  it("combines several lines topping up one item, keeping the earliest expiry", () => {
    const plan = planAdditions(
      [
        line("egg", 6, "count", { expires_on: "2026-10-20" }),
        line("eggs", 12, "count", { expires_on: "2026-10-10" }),
        line("eggs", 6, "count"),
      ],
      [have("a", "eggs", 2)],
      deps,
    )
    expect(plan.entries).toEqual([{ merge_into: "a", quantity: 24, expires_on: "2026-10-10" }])
    expect(plan).toMatchObject({ added: 0, toppedUp: 1 })
  })

  it("folds duplicate new lines into one row, converting units", () => {
    const plan = planAdditions(
      [
        line("ground beef", 1, "lb", { category: "meat", expires_on: "2026-10-03" }),
        line("ground beef", 8, "oz", { expires_on: "2026-10-02", is_staple: true }),
      ],
      [],
      deps,
    )
    expect(plan.entries).toEqual([
      expect.objectContaining({ name: "ground beef", quantity: 1.5, unit: "lb", category: "meat", expires_on: "2026-10-02", is_staple: true }),
    ])
    expect(plan.added).toBe(1)
  })

  it("keeps duplicate new lines apart when their units don't convert", () => {
    const plan = planAdditions([line("spinach", 1, "count"), line("spinach", 200, "g")], [], deps)
    expect(plan.added).toBe(2)
  })

  it("upgrades an untracked new line when the same thing comes with an amount", () => {
    const plan = planAdditions([line("apples", null), line("apple", 6)], [], deps)
    expect(plan.entries).toEqual([expect.objectContaining({ name: "apples", quantity: 6, unit: "count" })])
  })

  describe("lines without an amount", () => {
    it("are skipped when the same thing is untracked already", () => {
      const plan = planAdditions([line("salt", null)], [have("a", "salt", null)], deps)
      expect(plan).toEqual({ entries: [], outcomes: [{ type: "on-hand" }], added: 0, toppedUp: 0, alreadyOnHand: 1 })
    })

    it("are skipped when the same thing is tracked and in stock", () => {
      const plan = planAdditions([line("milk", null)], [have("a", "milk", 2, "cup")], deps)
      expect(plan).toMatchObject({ entries: [], alreadyOnHand: 1 })
    })

    it("are added when the same thing ran out", () => {
      const plan = planAdditions([line("milk", null)], [have("a", "milk", 0, "cup")], deps)
      expect(plan.entries).toEqual([expect.objectContaining({ name: "milk", quantity: null })])
    })

    it("are skipped when repeated in the same batch", () => {
      const plan = planAdditions([line("garlic", null), line("Garlic", null)], [], deps)
      expect(plan).toMatchObject({ added: 1, alreadyOnHand: 1 })
    })

    it("are skipped when an earlier line in the batch has an amount", () => {
      const plan = planAdditions([line("onions", 3), line("onion", null)], [], deps)
      expect(plan.entries).toEqual([expect.objectContaining({ name: "onions", quantity: 3 })])
      expect(plan.alreadyOnHand).toBe(1)
    })
  })

  it("keeps input order across inserts and merges", () => {
    const plan = planAdditions([line("bread", 1), line("eggs", 12), line("cheese", 8, "oz")], [have("e", "eggs", 0)], deps)
    expect(plan.entries.map((e) => ("merge_into" in e ? e.merge_into : e.name))).toEqual(["bread", "e", "cheese"])
  })

  it("rounds away float noise", () => {
    const plan = planAdditions([line("sugar", 0.1, "cup"), line("sugar", 0.2, "cup")], [], deps)
    expect(plan.entries[0]).toMatchObject({ quantity: 0.3 })
    expect(roundQuantity(1 / 3)).toBe(0.3333)
  })
})

describe("planAdditions outcomes", () => {
  it("says what happened to each line, in order", () => {
    const plan = planAdditions(
      [line("chicken", 1, "lb"), line("salt", null), line("rice", 2, "cup"), line("rice", 1, "cup")],
      [have("c", "chicken", 0.5, "lb"), have("s", "salt", null)],
      deps,
    )
    expect(plan.outcomes).toEqual([
      { type: "merge", into: "c" },
      { type: "on-hand" },
      { type: "insert" },
      { type: "insert" },
    ])
    expect(plan.added).toBe(1)
  })
})

describe("categoryOverrides", () => {
  it("keeps changed categories only, one per normalized name, last wins", () => {
    expect(
      categoryOverrides(
        [
          { name: "Oat milk", category: "beverages", category_changed: true },
          { name: "bananas", category: "produce", category_changed: false },
          { name: "oat milks ", category: "dairy", category_changed: true },
          { name: "tofu", category: "produce", category_changed: true },
        ],
        deps.normalize,
      ),
    ).toEqual([
      { ingredient_key: "oat milk", category: "dairy" },
      { ingredient_key: "tofu", category: "produce" },
    ])
  })

  it("skips names that normalize to nothing", () => {
    expect(categoryOverrides([{ name: "  ", category: "dairy", category_changed: true }], deps.normalize)).toEqual([])
  })
})

describe("describeAdditions", () => {
  it("summarizes for a toast", () => {
    expect(describeAdditions({ added: 5, toppedUp: 2, alreadyOnHand: 0 })).toBe("Added 5 items, topped up 2")
    expect(describeAdditions({ added: 1, toppedUp: 0, alreadyOnHand: 1 })).toBe("Added 1 item, 1 already on hand")
    expect(describeAdditions({ added: 0, toppedUp: 3, alreadyOnHand: 0 })).toBe("Topped up 3")
    expect(describeAdditions({ added: 0, toppedUp: 0, alreadyOnHand: 0 })).toBe("Nothing to add")
  })
})
