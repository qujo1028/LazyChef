import { describe, expect, it } from "vitest"

import { cookHistory, historyLabel, parseSavedSort, sortSaved, type SavedRecipe } from "./saved"

const tikka = { recipe_id: 715538, recipe_title: "Chicken Tikka Masala" }
const candy = { recipe_id: 649036, recipe_title: "Korean Candy Chicken" }

describe("cookHistory", () => {
  it("counts one cook per batch and keeps the latest time", () => {
    const history = cookHistory([
      { batch_id: 3, details: tikka, created_at: "2026-09-20T18:00:00Z" },
      { batch_id: 3, details: tikka, created_at: "2026-09-20T18:00:00Z" },
      { batch_id: "7", details: tikka, created_at: "2026-09-28T19:00:00Z" },
      { batch_id: 9, details: candy, created_at: "2026-09-25T12:00:00Z" },
      { batch_id: 10, details: {}, created_at: "2026-09-25T12:00:00Z" },
      { batch_id: 11, details: { recipe_title: "No id" }, created_at: "2026-09-25T12:00:00Z" },
    ])
    expect(Object.fromEntries(history)).toEqual({
      715538: { count: 2, lastAt: "2026-09-28T19:00:00Z" },
      649036: { count: 1, lastAt: "2026-09-25T12:00:00Z" },
    })
  })
})

function saved(id: number, savedAt: string, extra: Partial<SavedRecipe> = {}): SavedRecipe {
  return {
    id,
    title: `Recipe ${id}`,
    image: null,
    readyInMinutes: null,
    savedAt,
    savedBy: null,
    match: { have: 3, need: [] },
    history: null,
    ...extra,
  }
}

describe("sortSaved", () => {
  const recipes = [
    saved(1, "2026-09-01T00:00:00Z", { match: { have: 2, need: ["capers", "leeks"] } }),
    saved(2, "2026-09-02T00:00:00Z", { match: null, history: { count: 1, lastAt: "2026-09-10T00:00:00Z" } }),
    saved(3, "2026-09-03T00:00:00Z", { history: { count: 4, lastAt: "2026-09-05T00:00:00Z" } }),
    saved(4, "2026-09-04T00:00:00Z", { match: { have: 5, need: ["capers"] }, history: { count: 1, lastAt: "2026-09-20T00:00:00Z" } }),
    saved(5, "2026-09-05T00:00:00Z"),
  ]
  const ids = (list: SavedRecipe[]) => list.map((r) => r.id)

  it("puts what you can make first, unknown matches last", () => {
    expect(ids(sortSaved(recipes, "ready"))).toEqual([5, 3, 4, 1, 2])
  })
  it("sorts by newest", () => {
    expect(ids(sortSaved(recipes, "recent"))).toEqual([5, 4, 3, 2, 1])
  })
  it("sorts by most cooked, then most recently cooked", () => {
    expect(ids(sortSaved(recipes, "cooked"))).toEqual([3, 4, 2, 5, 1])
  })
  it("reads the sort from the URL", () => {
    expect(parseSavedSort("cooked")).toBe("cooked")
    expect(parseSavedSort(["recent"])).toBe("recent")
    expect(parseSavedSort("nope")).toBe("ready")
    expect(parseSavedSort(undefined)).toBe("ready")
  })
})

describe("historyLabel", () => {
  const now = Date.parse("2026-09-29T20:00:00Z")
  it("says today, yesterday, or the date", () => {
    expect(historyLabel({ count: 1, lastAt: "2026-09-29T12:00:00Z" }, now, "UTC")).toBe("Cooked once · last today")
    expect(historyLabel({ count: 2, lastAt: "2026-09-28T12:00:00Z" }, now, "UTC")).toBe("Cooked twice · last yesterday")
    expect(historyLabel({ count: 3, lastAt: "2026-09-12T12:00:00Z" }, now, "UTC")).toBe("Cooked 3 times · last Sep 12")
    expect(historyLabel({ count: 5, lastAt: "2025-12-24T12:00:00Z" }, now, "UTC")).toBe("Cooked 5 times · last Dec 24, 2025")
  })
  it("uses the viewer's time zone", () => {
    // 01:00 UTC on the 29th is still the 28th in Denver.
    expect(historyLabel({ count: 1, lastAt: "2026-09-29T01:00:00Z" }, now, "America/Denver")).toBe("Cooked once · last yesterday")
  })
})
