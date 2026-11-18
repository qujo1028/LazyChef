import { describe, expect, it } from "vitest"

import type { DailyCounter, SpoonacularDay } from "@/features/admin/stats"

import { addDays, cacheHitRate, countersByMetric, errorsByCode, fillDays, sumMetric, windowLabel } from "./limits"

const counter = (day: string, metric: string, n: number): DailyCounter => ({ day, metric, n })

const usage = (day: string, pointsUsed: number, exhaustedAt: string | null = null): SpoonacularDay => ({
  day,
  pointsUsed,
  pointsLeft: 50 - pointsUsed,
  requests: 1,
  estimated: false,
  exhaustedAt,
})

describe("addDays", () => {
  it("shifts across month and year boundaries in UTC", () => {
    expect(addDays("2026-11-17", -6)).toBe("2026-11-11")
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })
})

describe("fillDays", () => {
  const today = "2026-11-17"

  it("returns exactly `days` entries ending today, oldest first", () => {
    const filled = fillDays([], 30, today)
    expect(filled).toHaveLength(30)
    expect(filled[0].day).toBe("2026-10-19")
    expect(filled.at(-1)?.day).toBe(today)
  })

  it("fills missing days with zero usage and keeps real rows", () => {
    const filled = fillDays([usage("2026-11-16", 12, null), usage("2026-11-15", 50, "2026-11-15T09:00:00Z")], 3, today)
    expect(filled.map((d) => d.day)).toEqual(["2026-11-15", "2026-11-16", "2026-11-17"])
    expect(filled[0]).toMatchObject({ pointsUsed: 50, exhaustedAt: "2026-11-15T09:00:00Z" })
    expect(filled[1]).toMatchObject({ pointsUsed: 12, pointsLeft: 38 })
    expect(filled[2]).toEqual({
      day: today,
      pointsUsed: 0,
      pointsLeft: null,
      requests: 0,
      estimated: false,
      exhaustedAt: null,
    })
  })

  it("ignores rows outside the window", () => {
    const filled = fillDays([usage("2026-01-01", 40)], 2, today)
    expect(filled.every((d) => d.pointsUsed === 0)).toBe(true)
  })
})

describe("windowLabel", () => {
  it("names whole hours, minutes and days", () => {
    expect(windowLabel(3600)).toBe("1 hour")
    expect(windowLabel(7200)).toBe("2 hours")
    expect(windowLabel(900)).toBe("15 min")
    expect(windowLabel(60)).toBe("1 min")
    expect(windowLabel(86400)).toBe("1 day")
    expect(windowLabel(172800)).toBe("2 days")
  })

  it("falls back to seconds for odd or non-positive windows", () => {
    expect(windowLabel(90)).toBe("90 sec")
    expect(windowLabel(0)).toBe("0 sec")
  })
})

describe("countersByMetric", () => {
  it("groups by metric then day and adds repeated rows", () => {
    const byMetric = countersByMetric([
      counter("2026-11-16", "ai_calls", 3),
      counter("2026-11-17", "ai_calls", 5),
      counter("2026-11-17", "ai_calls", 2),
      counter("2026-11-17", "rate_limited:ai", 1),
    ])
    expect(byMetric.get("ai_calls")?.get("2026-11-17")).toBe(7)
    expect(byMetric.get("ai_calls")?.get("2026-11-16")).toBe(3)
    expect(byMetric.get("rate_limited:ai")?.get("2026-11-17")).toBe(1)
    expect(byMetric.has("missing")).toBe(false)
  })

  it("returns an empty map for no rows", () => {
    expect(countersByMetric([]).size).toBe(0)
  })
})

describe("sumMetric", () => {
  it("totals the rows whose metric matches", () => {
    const rows = [
      counter("2026-11-16", "ai_error:timeout", 2),
      counter("2026-11-17", "ai_error:timeout", 1),
      counter("2026-11-17", "ai_calls", 9),
    ]
    expect(sumMetric(rows, (m) => m.startsWith("ai_error:"))).toBe(3)
    expect(sumMetric(rows, () => false)).toBe(0)
    expect(sumMetric([], () => true)).toBe(0)
  })
})

describe("cacheHitRate", () => {
  it("is hits over hits plus misses", () => {
    const rows = [
      counter("2026-11-16", "spoonacular_cache:hit", 3),
      counter("2026-11-17", "spoonacular_cache:miss", 1),
    ]
    expect(cacheHitRate(rows)).toBe(0.75)
  })

  it("is null when there were no lookups", () => {
    expect(cacheHitRate([])).toBeNull()
    expect(cacheHitRate([counter("2026-11-17", "ai_calls", 4)])).toBeNull()
  })

  it("is 0 when every lookup missed", () => {
    expect(cacheHitRate([counter("2026-11-17", "spoonacular_cache:miss", 2)])).toBe(0)
  })
})

describe("errorsByCode", () => {
  it("sums by code, biggest first, and ignores other prefixes", () => {
    const rows = [
      counter("2026-11-16", "ai_error:timeout", 2),
      counter("2026-11-17", "ai_error:timeout", 3),
      counter("2026-11-17", "ai_error:bad_json", 4),
      counter("2026-11-17", "ai_error:rate_limit", 1),
      counter("2026-11-17", "spoonacular_error:quota", 9),
    ]
    expect(errorsByCode(rows, "ai_error:")).toEqual([
      { code: "timeout", total: 5 },
      { code: "bad_json", total: 4 },
      { code: "rate_limit", total: 1 },
    ])
  })

  it("breaks ties by code name", () => {
    const rows = [counter("2026-11-17", "spoonacular_error:b", 1), counter("2026-11-17", "spoonacular_error:a", 1)]
    expect(errorsByCode(rows, "spoonacular_error:").map((e) => e.code)).toEqual(["a", "b"])
  })

  it("is empty when nothing matches", () => {
    expect(errorsByCode([counter("2026-11-17", "ai_calls", 1)], "ai_error:")).toEqual([])
  })
})
