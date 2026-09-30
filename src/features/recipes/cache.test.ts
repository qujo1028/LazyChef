import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { SpoonacularError } from "@/lib/spoonacular/client"

import {
  cachedSpoonacular,
  isResting,
  memoryStore,
  recipeCacheKey,
  suggestionsCacheKey,
  type Usage,
} from "./cache-core"
import { NO_FILTERS } from "./filters"

const quota = (used: number, left: number) => ({ request: 1.4, used, left })

describe("suggestionsCacheKey", () => {
  it("ignores order, case, plurals and duplicates", () => {
    const a = suggestionsCacheKey(["Eggs", "spinach", "rice"], NO_FILTERS)
    expect(suggestionsCacheKey(["rice", "egg", "Spinach", "eggs"], NO_FILTERS)).toBe(a)
    expect(a).toMatch(/^find:[\w-]{32}$/)
  })

  it("changes with the pantry and with the filters", () => {
    const base = suggestionsCacheKey(["eggs", "rice"], NO_FILTERS)
    expect(suggestionsCacheKey(["eggs", "rice", "milk"], NO_FILTERS)).not.toBe(base)
    const breakfast = suggestionsCacheKey(["eggs", "rice"], { type: "breakfast", maxTime: null })
    expect(breakfast).toMatch(/^search:/)
    expect(suggestionsCacheKey(["eggs", "rice"], { type: "breakfast", maxTime: 30 })).not.toBe(breakfast)
    expect(suggestionsCacheKey(["eggs", "rice"], { type: null, maxTime: 30 })).not.toBe(breakfast)
  })

  it("recipe details are keyed by id", () => {
    expect(recipeCacheKey(715538)).toBe("info:715538")
  })
})

describe("isResting", () => {
  const usage = (left: number | null, exhausted = false): Usage => ({ used: 0, left, exhausted })

  it("keeps a reserve and stops after a 402", () => {
    expect(isResting(null, 2.2)).toBe(false)
    expect(isResting(usage(null), 2.2)).toBe(false)
    expect(isResting(usage(10), 2.2)).toBe(false)
    expect(isResting(usage(5), 2.2)).toBe(true) // 5 - 2.2 < 3
    expect(isResting(usage(2), 1, 1)).toBe(false)
    expect(isResting(usage(40, true), 1)).toBe(true)
  })
})

describe("cachedSpoonacular", () => {
  it("a repeat visit within the hour costs nothing", async () => {
    let now = Date.parse("2026-09-29T12:00:00Z")
    const store = memoryStore(() => now)
    const load = vi.fn(async () => ({ value: [{ id: 1 }], quota: quota(1.4, 48.6) }))

    const first = await cachedSpoonacular(store, "find:x", load, { cost: 1.4 })
    expect(first.fromCache).toBe(false)
    expect(first.usage).toEqual({ used: 1.4, left: 48.6, exhausted: false })

    now += 59 * 60_000
    const second = await cachedSpoonacular(store, "find:x", load, { cost: 1.4 })
    expect(second.fromCache).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)

    now += 2 * 60_000 // past the hour
    await cachedSpoonacular(store, "find:x", load, { cost: 1.4 })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("stops before the daily limit, but still serves what's cached", async () => {
    const store = memoryStore(() => Date.parse("2026-09-29T12:00:00Z"))
    await cachedSpoonacular(store, "info:1", async () => ({ value: { id: 1 }, quota: quota(46, 4) }), { cost: 1 })
    const load = vi.fn(async () => ({ value: [], quota: quota(48, 2) }))

    await expect(cachedSpoonacular(store, "find:new", load, { cost: 1.4 })).rejects.toMatchObject({ code: "quota" })
    expect(load).not.toHaveBeenCalled()
    await expect(cachedSpoonacular(store, "info:1", load, { cost: 1 })).resolves.toMatchObject({ fromCache: true })
    // Opening a recipe only keeps 1 point back.
    await expect(cachedSpoonacular(store, "info:2", load, { cost: 1, reserve: 1 })).resolves.toMatchObject({ fromCache: false })
  })

  it("a 402 marks the day used up for everyone until midnight UTC", async () => {
    let now = Date.parse("2026-09-29T23:00:00Z")
    const store = memoryStore(() => now)
    const failing = vi.fn(async () => {
      throw new SpoonacularError("quota", { status: 402 })
    })
    await expect(cachedSpoonacular(store, "find:a", failing, { cost: 1.4 })).rejects.toMatchObject({ code: "quota" })
    expect(await store.usage()).toMatchObject({ left: 0, exhausted: true })

    const load = vi.fn(async () => ({ value: [], quota: quota(1.4, 48.6) }))
    await expect(cachedSpoonacular(store, "find:b", load, { cost: 1.4 })).rejects.toMatchObject({ code: "quota" })
    expect(load).not.toHaveBeenCalled()

    now = Date.parse("2026-09-30T00:00:01Z")
    await expect(cachedSpoonacular(store, "find:b", load, { cost: 1.4 })).resolves.toMatchObject({ fromCache: false })
  })

  it("counts the estimated cost when the quota headers are missing", async () => {
    const store = memoryStore(() => Date.parse("2026-09-29T12:00:00Z"))
    await store.record({ quota: quota(10, 40) })
    await cachedSpoonacular(store, "search:a", async () => ({ value: [], quota: null }), { cost: 2.2 })
    const usage = await store.usage()
    expect(usage?.used).toBeCloseTo(12.2)
    expect(usage?.left).toBeCloseTo(37.8)
  })

  it("other errors don't touch usage", async () => {
    const store = memoryStore()
    const failing = async () => {
      throw new SpoonacularError("timeout")
    }
    await expect(cachedSpoonacular(store, "find:a", failing, { cost: 1 })).rejects.toMatchObject({ code: "timeout" })
    expect(await store.usage()).toBeNull()
  })

  it("checks the per-person limit only when it would spend points", async () => {
    const store = memoryStore(() => Date.parse("2026-09-29T12:00:00Z"))
    const load = vi.fn(async () => ({ value: [1], quota: quota(1.4, 48.6) }))
    const gate = vi.fn(async () => {})
    await cachedSpoonacular(store, "find:x", load, { cost: 1.4, beforeSpend: gate })
    await cachedSpoonacular(store, "find:x", load, { cost: 1.4, beforeSpend: gate })
    expect(gate).toHaveBeenCalledTimes(1)

    const blocked = vi.fn(async () => {
      throw new Error("limited")
    })
    await expect(cachedSpoonacular(store, "find:y", load, { cost: 1.4, beforeSpend: blocked })).rejects.toThrow("limited")
    expect(load).toHaveBeenCalledTimes(1)
  })
})
