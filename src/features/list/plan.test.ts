import { describe, expect, it } from "vitest"

import { describeListAdditions, planListAdditions, type ListPlanDeps, type OpenLine } from "./plan"
import type { NewListLine } from "./types"

const MASS: Record<string, number> = { g: 1, oz: 28.349523125, lb: 453.59237 }
const VOLUME: Record<string, number> = { ml: 1, tbsp: 14.7868, cup: 236.588 }
const deps: ListPlanDeps = {
  normalize: (name) => name.trim().toLowerCase().replace(/s$/, ""),
  convert: (quantity, from, to) => {
    if (from === to) return quantity
    for (const table of [MASS, VOLUME]) if (from in table && to in table) return (quantity * table[from]) / table[to]
    return null
  },
}

function line(name: string, quantity: number | null, unit: string | null = null, extra: Partial<NewListLine> = {}): NewListLine {
  return { name, quantity, unit, category: "other", ingredient_id: null, note: null, recipe_id: null, recipe_title: null, ...extra }
}

function open(id: string, name: string, quantity: number | null, unit: string | null = null, ingredient_id: number | null = null): OpenLine {
  return { id, name, quantity, unit, ingredient_id }
}

describe("planListAdditions", () => {
  it("adds new lines, dropping the 'count' unit", () => {
    const plan = planListAdditions([line(" eggs ", 12, "count"), line("chicken breast", 2, "lb")], [], deps)
    expect(plan.entries).toEqual([line("eggs", 12, null), line("chicken breast", 2, "lb")])
    expect(plan.added).toBe(2)
  })

  it("tops up an unchecked line, converting units", () => {
    const plan = planListAdditions([line("chicken", 8, "oz"), line("Chickens", 0.5, "lb")], [open("c", "chicken", 1, "lb")], deps)
    expect(plan.entries).toEqual([{ merge_into: "c", quantity: 1 }])
    expect(plan).toMatchObject({ added: 0, toppedUp: 1, alreadyOnList: 0 })
  })

  it("matches by ingredient id", () => {
    const plan = planListAdditions([line("scallions", 2, null, { ingredient_id: 11291 })], [open("g", "green onion", 1, null, 11291)], deps)
    expect(plan.entries).toEqual([{ merge_into: "g", quantity: 2 }])
  })

  it("counts things already on the list when there's nothing to add to", () => {
    const plan = planListAdditions(
      [line("milk", null), line("eggs", 6), line("garlic", 2, "clove")],
      [open("m", "milk", 1, "cup"), open("e", "eggs", null), open("g", "garlic", 1, "head")],
      deps,
    )
    expect(plan.entries).toEqual([])
    expect(plan.alreadyOnList).toBe(3)
  })

  it("folds repeats in one batch", () => {
    const plan = planListAdditions(
      [line("rice", 1, "cup"), line("rice", 2, "cup"), line("milk", null), line("milk", 1, "cup"), line("flour", 1, "cup"), line("flour", 1, "lb")],
      [],
      deps,
    )
    expect(plan.entries).toEqual([line("rice", 3, "cup"), line("milk", 1, "cup"), line("flour", null, null)])
    expect(plan.added).toBe(3)
  })

  it("keeps recipe details on new lines", () => {
    const plan = planListAdditions([line("capers", 2, "tbsp", { recipe_id: 7, recipe_title: "Piccata" })], [], deps)
    expect(plan.entries[0]).toMatchObject({ recipe_id: 7, recipe_title: "Piccata" })
  })
})

describe("describeListAdditions", () => {
  it("says what happened", () => {
    expect(describeListAdditions({ added: 1, toppedUp: 0, alreadyOnList: 0 })).toBe("Added 1 item")
    expect(describeListAdditions({ added: 2, toppedUp: 1, alreadyOnList: 1 })).toBe("Added 2 items, topped up 1, 1 already on the list")
    expect(describeListAdditions({ added: 0, toppedUp: 0, alreadyOnList: 0 })).toBe("Nothing to add")
  })
})
