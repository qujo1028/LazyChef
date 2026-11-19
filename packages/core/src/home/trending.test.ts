import { describe, expect, it } from "vitest"

import { buildHomeRecipes, trendingLine, type PoolRecipe, type TrendingRow } from "./trending"

const trend = (id: string, count = 3): TrendingRow => ({
  id,
  title: `T ${id}`,
  image_url: `https://img/${id}.jpg`,
  ready_in_minutes: 20,
  household_count: count,
})
const pool = (n: number, prefix = "p"): PoolRecipe[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${String(i).padStart(2, "0")}`,
    title: `P ${i}`,
    image_url: `https://img/${prefix}${i}.jpg`,
    ready_in_minutes: 30,
  }))
const ids = (cards: { id: string }[]) => cards.map((c) => c.id)

describe("buildHomeRecipes", () => {
  it("puts trending first, in order, then tops up with picks", () => {
    const cards = buildHomeRecipes([trend("a", 5), trend("b", 2)], pool(20), "2026-11-18")
    expect(cards).toHaveLength(10)
    expect(ids(cards).slice(0, 2)).toEqual(["a", "b"])
    expect(cards.slice(0, 2).map((c) => c.tag)).toEqual(["Trending", "Trending"])
    expect(cards.slice(0, 2).map((c) => c.householdCount)).toEqual([5, 2])
    expect(cards.slice(2).every((c) => c.tag === "Try something new" && c.householdCount === null)).toBe(true)
  })

  it("never repeats an id, including trending ones that are also in the pool", () => {
    const cards = buildHomeRecipes([trend("p00"), trend("p00"), trend("p01")], pool(12), "2026-11-18")
    expect(new Set(ids(cards)).size).toBe(cards.length)
    expect(cards.filter((c) => c.id === "p00")[0].tag).toBe("Trending")
  })

  it("stops at the target when trending alone is enough", () => {
    const many = Array.from({ length: 14 }, (_, i) => trend(`t${i}`))
    const cards = buildHomeRecipes(many, pool(20), "2026-11-18")
    expect(cards).toHaveLength(10)
    expect(cards.every((c) => c.tag === "Trending")).toBe(true)
  })

  it("is stable on the same day, whatever order the pool arrives in", () => {
    const a = buildHomeRecipes([], pool(30), "2026-11-18")
    const b = buildHomeRecipes([], [...pool(30)].reverse(), "2026-11-18")
    expect(ids(a)).toEqual(ids(b))
  })

  it("changes order on another day", () => {
    const a = buildHomeRecipes([], pool(30), "2026-11-18")
    const b = buildHomeRecipes([], pool(30), "2026-11-19")
    expect(ids(a)).not.toEqual(ids(b))
  })

  it("returns what it has when the pool is short", () => {
    expect(buildHomeRecipes([trend("a")], pool(3), "d")).toHaveLength(4)
  })

  it("handles empty inputs", () => {
    expect(buildHomeRecipes([], [], "2026-11-18")).toEqual([])
  })

  it("prefers recipes with an image", () => {
    const noImage: PoolRecipe[] = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      title: "x",
      image_url: null,
      ready_in_minutes: null,
    }))
    const cards = buildHomeRecipes([], [...noImage, ...pool(4)], "2026-11-18", 6)
    expect(ids(cards).slice(0, 4).every((id) => id.startsWith("p"))).toBe(true)
    expect(cards.slice(4).every((c) => c.image === null)).toBe(true)
  })

  it("respects a custom target", () => {
    expect(buildHomeRecipes([], pool(20), "d", 4)).toHaveLength(4)
  })
})

describe("trendingLine", () => {
  it("says how many households", () => {
    expect(trendingLine({ tag: "Trending", householdCount: 3 })).toBe("Cooked by 3 households")
    expect(trendingLine({ tag: "Trending", householdCount: 1 })).toBe("Cooked by 1 household")
  })
  it("is null for picks", () => {
    expect(trendingLine({ tag: "Try something new", householdCount: null })).toBeNull()
  })
})
