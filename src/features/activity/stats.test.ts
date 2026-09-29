import { describe, expect, it } from "vitest"

import type { Json } from "@/types/database"

import { addDays, computeStats, cookingStreak, weekLabel, weekStart, type StatsRow } from "./stats"

const ALEX = "alex"
const BLAIR = "blair"
const tikka = { recipe_id: 715538, recipe_title: "Chicken Tikka Masala" }
const candy = { recipe_id: 649036, recipe_title: "Korean Candy Chicken" }

let nextBatch = 1
function cook(at: string, details: Json, actorId = ALEX, items = ["chicken breast", "rice"]): StatsRow[] {
  const batchId = nextBatch++
  return items.map((itemName) => ({ action: "cooked", batchId, actorId, itemName, details, createdAt: at }))
}
function trip(at: string, items: string[], actorId = BLAIR): StatsRow[] {
  const batchId = nextBatch++
  return items.map((itemName) => ({ action: "shopped", batchId, actorId, itemName, details: {}, createdAt: at }))
}

// Tuesday, Sep 29 2026, 8 PM UTC.
const NOW = Date.parse("2026-09-29T20:00:00Z")

describe("day helpers", () => {
  it("does day math and finds the week's Monday", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(weekStart("2026-09-29")).toBe("2026-09-28")
    expect(weekStart("2026-09-28")).toBe("2026-09-28")
    expect(weekStart("2026-10-04")).toBe("2026-09-28")
    expect(weekLabel("2026-09-28")).toBe("Sep 28")
  })

  it("counts a streak ending today or yesterday", () => {
    const days = new Set(["2026-09-26", "2026-09-27", "2026-09-28"])
    expect(cookingStreak(days, "2026-09-29")).toBe(3)
    expect(cookingStreak(new Set([...days, "2026-09-29"]), "2026-09-29")).toBe(4)
    expect(cookingStreak(days, "2026-09-30")).toBe(0)
  })
})

describe("computeStats", () => {
  const rows = [
    ...cook("2026-09-29T18:00:00Z", tikka),
    ...cook("2026-09-28T18:00:00Z", candy, BLAIR),
    ...cook("2026-09-27T18:00:00Z", tikka),
    ...cook("2026-09-10T18:00:00Z", tikka),
    ...cook("2026-08-15T18:00:00Z", candy),
    ...cook("2026-03-01T18:00:00Z", { recipe_title: "Old soup" }), // outside the chart
    ...trip("2026-09-26T15:00:00Z", ["eggs", "Milk", "rice"]),
    ...trip("2026-09-12T15:00:00Z", ["eggs", "milk"], ALEX),
    ...trip("2026-08-20T15:00:00Z", ["eggs"]),
  ]
  const stats = computeStats(rows, NOW, "UTC")

  it("counts cooks (one per batch) this month, last month, and the streak", () => {
    expect(stats.cooks).toEqual({ total: 6, thisMonth: 4, lastMonth: 1, streak: 3 })
  })

  it("charts the last 12 weeks, oldest first", () => {
    expect(stats.weeks).toHaveLength(12)
    expect(stats.weeks.at(-1)).toEqual({ start: "2026-09-28", count: 2 })
    expect(stats.weeks.at(-2)).toEqual({ start: "2026-09-21", count: 1 })
    expect(stats.weeks[0].start).toBe("2026-07-13")
    expect(stats.weeks.reduce((sum, week) => sum + week.count, 0)).toBe(5)
  })

  it("ranks recipes by times cooked", () => {
    expect(stats.topRecipes.map((r) => [r.title, r.count])).toEqual([
      ["Chicken Tikka Masala", 3],
      ["Korean Candy Chicken", 2],
      ["Old soup", 1],
    ])
    expect(stats.topRecipes[0]).toMatchObject({ id: 715538, lastAt: "2026-09-29T18:00:00Z" })
  })

  it("counts trips and what gets bought most (case-insensitive)", () => {
    expect(stats.trips).toEqual({ total: 3, thisMonth: 2, itemsThisMonth: 5 })
    expect(stats.mostBought).toEqual([
      { name: "eggs", count: 3 },
      { name: "Milk", count: 2 },
      { name: "rice", count: 1 },
    ])
  })

  it("sums up each housemate", () => {
    expect(stats.people).toEqual([
      { actorId: ALEX, cooks: 5, trips: 1, itemsBought: 2 },
      { actorId: BLAIR, cooks: 1, trips: 2, itemsBought: 4 },
    ])
  })

  it("knows how far back it goes, and handles an empty household", () => {
    expect(stats.since).toBe("2026-03-01T18:00:00Z")
    const empty = computeStats([], NOW, "UTC")
    expect(empty).toMatchObject({ since: null, cooks: { total: 0, streak: 0 }, topRecipes: [], mostBought: [], people: [] })
    expect(empty.weeks.every((week) => week.count === 0)).toBe(true)
  })

  it("uses the viewer's time zone for days", () => {
    // 01:00 UTC on Oct 1 is still Sep 30 in Denver, so it counts for September there.
    const late = cook("2026-10-01T01:00:00Z", tikka)
    const oct = Date.parse("2026-10-01T02:00:00Z")
    expect(computeStats(late, oct, "UTC").cooks.thisMonth).toBe(1)
    expect(computeStats(late, oct, "America/Denver").cooks.thisMonth).toBe(1)
    expect(computeStats(late, Date.parse("2026-10-02T12:00:00Z"), "America/Denver").cooks).toMatchObject({ thisMonth: 0, lastMonth: 1 })
  })
})
