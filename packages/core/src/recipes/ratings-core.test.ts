import { describe, expect, it } from "vitest"

import { cookAgainRefs, nextPrompt, rateInput, unratedCooks, type CookedRow } from "./ratings-core"

const LOCAL = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

describe("rateInput", () => {
  it("accepts thumbs up/down and normalises refs", () => {
    expect(rateInput.parse({ ref: "715538", rating: 1 })).toEqual({ ref: "715538", rating: 1 })
    expect(rateInput.parse({ ref: LOCAL.toUpperCase(), rating: -1 })).toEqual({ ref: LOCAL, rating: -1 })
  })
  it("rejects bad refs and ratings", () => {
    expect(rateInput.safeParse({ ref: "nope", rating: 1 }).success).toBe(false)
    expect(rateInput.safeParse({ ref: "0", rating: 1 }).success).toBe(false)
    for (const rating of [0, 2, "1", null]) expect(rateInput.safeParse({ ref: "1", rating }).success).toBe(false)
  })
})

const cook = (batch: number, at: string, recipe_id: number | null, title = "Tikka"): CookedRow => ({
  batch_id: batch,
  created_at: at,
  details: recipe_id === null ? { recipe_title: title, local_recipe_id: LOCAL } : { recipe_id, recipe_title: title },
})

describe("unratedCooks", () => {
  const now = Date.parse("2026-11-17T12:00:00Z")

  it("needs an earlier local day, not 24 hours", () => {
    // New York is UTC-5 in November: 23:30 local on the 16th is 04:30Z on the 17th.
    const lateLastNight = cook(1, "2026-11-17T04:30:00Z", 1)
    const thisMorning = cook(2, "2026-11-17T13:00:00Z", 2)
    expect(unratedCooks([lateLastNight, thisMorning], new Set(), now, "America/New_York").map((c) => c.ref)).toEqual(["1"])
    // In UTC the same cook happened today.
    expect(unratedCooks([lateLastNight], new Set(), now, "UTC")).toEqual([])
  })

  it("skips rated recipes, keeps newest first, one per recipe and batch", () => {
    const rows = [
      cook(1, "2026-11-10T12:00:00Z", 1, "Old"),
      cook(2, "2026-11-15T12:00:00Z", 1, "New"),
      cook(3, "2026-11-14T12:00:00Z", 2),
      cook(3, "2026-11-14T12:00:00Z", 2),
      cook(4, "2026-11-13T12:00:00Z", 3),
      cook(5, "2026-11-12T12:00:00Z", null, "Local"),
    ]
    const result = unratedCooks(rows, new Set(["3"]), now, "UTC")
    expect(result.map((c) => [c.ref, c.title])).toEqual([["1", "New"], ["2", "Tikka"], [LOCAL, "Local"]])
  })

  it("drops cooks older than two weeks and rows without a recipe", () => {
    const rows = [cook(1, "2026-10-01T12:00:00Z", 1), { batch_id: 2, created_at: "2026-11-15T12:00:00Z", details: {} }]
    expect(unratedCooks(rows, new Set(), now, "UTC")).toEqual([])
  })
})

describe("nextPrompt", () => {
  const cooks = [
    { key: "9", ref: "1", title: "A", cookedAt: "" },
    { key: "8", ref: "2", title: "B", cookedAt: "" },
  ]
  it("hides dismissed cooks, one at a time", () => {
    expect(nextPrompt(cooks, new Set())?.key).toBe("9")
    expect(nextPrompt(cooks, new Set(["9"]))?.key).toBe("8")
    expect(nextPrompt(cooks, new Set(["9", "8"]))).toBeNull()
  })
})

describe("cookAgainRefs", () => {
  const vote = (user: string, ref: string, rating: number, at = "2026-11-10T00:00:00Z") => ({
    user_id: user,
    recipe_ref: ref,
    rating,
    updated_at: at,
  })
  it("keeps net-positive recipes, best first, ties by recency", () => {
    const ratings = [
      vote("a", "1", 1),
      vote("b", "1", 1),
      vote("a", "2", 1, "2026-11-12T00:00:00Z"),
      vote("a", "3", 1),
      vote("b", "3", -1),
      vote("a", "4", -1),
      vote("a", "5", 1, "2026-11-11T00:00:00Z"),
    ]
    expect(cookAgainRefs(ratings)).toEqual(["1", "2", "5"])
    expect(cookAgainRefs(ratings, 2)).toEqual(["1", "2"])
  })
  it("is empty without votes", () => expect(cookAgainRefs([])).toEqual([]))
})
