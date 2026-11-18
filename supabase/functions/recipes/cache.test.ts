import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/features/admin/metrics", () => ({ bumpMetric: async () => {} }))

import * as web from "@/features/recipes/cache-core"

import {
  cachedSpoonacular,
  isResting,
  memoryStore,
  recipeCacheKey,
  suggestionsCacheKey,
  toRecipeQuota,
} from "./cache.ts"
import { SpoonacularError } from "./spoonacular.ts"

const NONE = { type: null, maxTime: null, query: null }

describe("cache keys", () => {
  it("match the web app's, so both share one cache", async () => {
    const cases: [string[], { type: string | null; maxTime: number | null; query: string | null }][] = [
      [["Eggs", "spinach", "rice"], NONE],
      [["rice", "egg", "Spinach", "eggs"], NONE],
      [["jalapeño", "crème fraîche"], NONE],
      [["chicken breast", "rice"], { type: "main course", maxTime: 30, query: null }],
      [["chicken"], { type: null, maxTime: null, query: "Chicken  Curry" }],
      [[], { type: "breakfast", maxTime: 15, query: "oats" }],
    ]
    for (const [names, filters] of cases) {
      expect(await suggestionsCacheKey(names, filters)).toBe(web.suggestionsCacheKey(names, filters))
    }
    expect(recipeCacheKey(715538)).toBe(web.recipeCacheKey(715538))
  })

  it("ignore order, case, plurals and duplicates", async () => {
    const a = await suggestionsCacheKey(["Eggs", "spinach", "rice"], NONE)
    expect(await suggestionsCacheKey(["rice", "egg", "Spinach", "eggs"], NONE)).toBe(a)
    expect(a).toMatch(/^find:[\w-]{32}$/)
    expect(await suggestionsCacheKey(["eggs"], { ...NONE, maxTime: 30 })).toMatch(/^search:/)
  })
})

describe("quota", () => {
  const now = new Date("2026-11-18T15:30:00Z")

  it("resets at the next midnight UTC", () => {
    expect(toRecipeQuota(null, now)).toEqual({ pointsLeft: null, resetsAt: "2026-11-19T00:00:00.000Z", resting: false })
  })

  it("rests when exhausted or under the reserve", () => {
    expect(toRecipeQuota({ used: 50, left: 0, exhausted: true }, now).resting).toBe(true)
    expect(toRecipeQuota({ used: 46, left: 4, exhausted: false }, now)).toMatchObject({ pointsLeft: 4, resting: true })
    expect(toRecipeQuota({ used: 40, left: 10, exhausted: false }, now)).toMatchObject({ pointsLeft: 10, resting: false })
  })

  it("isResting keeps the reserve", () => {
    expect(isResting(null, 5)).toBe(false)
    expect(isResting({ used: 0, left: null, exhausted: false }, 5)).toBe(false)
    expect(isResting({ used: 0, left: 5, exhausted: false }, 2.5, 1)).toBe(false)
    expect(isResting({ used: 0, left: 5, exhausted: false }, 2.5)).toBe(true)
  })
})

describe("cachedSpoonacular", () => {
  const quota = (used: number, left: number) => ({ request: 1.4, used, left })

  it("loads once, then serves the cache", async () => {
    const store = memoryStore()
    const load = vi.fn(async () => ({ value: [1, 2], quota: quota(1.4, 48.6) }))
    const first = await cachedSpoonacular(store, "find:x", load, { cost: 1.4 })
    const second = await cachedSpoonacular(store, "find:x", load, { cost: 1.4 })
    expect(first).toMatchObject({ value: [1, 2], fromCache: false, usage: { used: 1.4, left: 48.6 } })
    expect(second).toMatchObject({ value: [1, 2], fromCache: true })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("expires entries after an hour", async () => {
    let clock = 0
    const store = memoryStore(() => clock)
    await store.put("k", 1)
    clock = 60 * 60 * 1000 - 1
    expect(await store.get("k")).not.toBeNull()
    clock = 60 * 60 * 1000
    expect(await store.get("k")).toBeNull()
  })

  it("refuses to spend under the reserve, without calling beforeSpend", async () => {
    const store = memoryStore()
    await store.record({ quota: quota(47, 3) })
    const beforeSpend = vi.fn(async () => {})
    await expect(cachedSpoonacular(store, "k", async () => ({ value: 1, quota: null }), { cost: 1.4, beforeSpend })).rejects.toMatchObject({
      code: "quota",
    })
    expect(beforeSpend).not.toHaveBeenCalled()
  })

  it("records a 402 as exhausted", async () => {
    const store = memoryStore()
    const load = async () => {
      throw new SpoonacularError("quota", { status: 402, quota: quota(50, 0) })
    }
    await expect(cachedSpoonacular(store, "k", load, { cost: 1 })).rejects.toBeInstanceOf(SpoonacularError)
    expect(await store.usage()).toMatchObject({ exhausted: true, left: 0 })
  })

  it("falls back to the estimate without quota headers", async () => {
    const store = memoryStore()
    await store.record({ quota: quota(10, 40) })
    await cachedSpoonacular(store, "k", async () => ({ value: 1, quota: null }), { cost: 2.2 })
    expect(await store.usage()).toMatchObject({ used: 12.2, left: 37.8 })
  })
})
