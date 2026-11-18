import { describe, expect, it } from "vitest"

import {
  addDays,
  cohortPercents,
  counterSeries,
  counterSeriesFromStart,
  dayRange,
  fillDays,
  findMetric,
  firstValueDay,
  formatByStore,
  lastDays,
  ratio,
  shareOf,
  stackActivity,
  storeLabel,
  utcDay,
} from "./overview-format"

describe("dates", () => {
  it("formats and moves UTC days across month ends", () => {
    expect(utcDay(new Date("2026-11-17T23:59:00Z"))).toBe("2026-11-17")
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })
  it("builds ranges", () => {
    expect(dayRange("2026-11-29", "2026-12-01")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"])
    expect(dayRange("2026-12-02", "2026-12-01")).toEqual([])
    const d = lastDays("2026-11-17", 30)
    expect(d).toHaveLength(30)
    expect(d[0]).toBe("2026-10-19")
    expect(d[29]).toBe("2026-11-17")
  })
})

describe("series", () => {
  const days = ["2026-11-01", "2026-11-02", "2026-11-03"]
  it("fills missing days with the given fill", () => {
    const rows = [{ day: "2026-11-02", n: 4 }]
    expect(fillDays(rows, days, (r) => r.n, 0)).toEqual([0, 4, 0])
    expect(fillDays(rows, days, (r) => r.n, null)).toEqual([null, 4, null])
  })
  it("keeps null values from rows as null", () => {
    expect(fillDays([{ day: "2026-11-01", n: null }], days, (r) => r.n, 0)).toEqual([null, 0, 0])
  })
  it("makes counter series with gaps", () => {
    const c = [
      { day: "2026-11-01", metric: "ai_calls", n: 2 },
      { day: "2026-11-03", metric: "ai_calls", n: 5 },
      { day: "2026-11-02", metric: "other", n: 9 },
    ]
    expect(counterSeries(c, "ai_calls", days)).toEqual([2, null, 5])
  })
  it("fills zeros from the first counter day, leaving earlier days as gaps", () => {
    const c = [
      { day: "2026-11-02", metric: "ai_calls", n: 2 },
      { day: "2026-11-03", metric: "ai_allowance_free", n: 1 },
      { day: "2026-11-03", metric: "unrelated", n: 9 },
      { day: "2026-10-01", metric: "ai_calls", n: 7 },
    ]
    const out = counterSeriesFromStart(c, ["ai_calls", "ai_allowance_free", "ai_allowance_denied"], days)
    expect(out.start).toBe("2026-11-02")
    expect(out.series.ai_calls).toEqual([null, 2, 0])
    expect(out.series.ai_allowance_free).toEqual([null, 0, 1])
    expect(out.series.ai_allowance_denied).toEqual([null, 0, 0])
  })
  it("is all gaps when nothing is tracked", () => {
    const out = counterSeriesFromStart([], ["ai_calls"], days)
    expect(out.start).toBeNull()
    expect(out.series.ai_calls).toEqual([null, null, null])
  })
  it("finds the first day with a value", () => {
    expect(firstValueDay(days, [null, 3, 4])).toBe("2026-11-02")
    expect(firstValueDay(days, [null, null, null])).toBeNull()
  })
})

describe("stackActivity", () => {
  it("sums per day and action in the given order, dropping unknown actions", () => {
    const rows = [
      { day: "2026-11-01", action: "added", n: 3 },
      { day: "2026-11-01", action: "used", n: 2 },
      { day: "2026-11-01", action: "mystery", n: 50 },
      { day: "2026-11-03", action: "added", n: 1 },
    ]
    const out = stackActivity(rows, ["2026-11-01", "2026-11-02", "2026-11-03"], ["added", "used"])
    expect(out.map((c) => c.total)).toEqual([5, 0, 1])
    expect(out[0].segments).toEqual([
      { key: "added", n: 3 },
      { key: "used", n: 2 },
    ])
  })
})

describe("cohortPercents", () => {
  it("returns shares with null for weeks that haven't happened", () => {
    const out = cohortPercents({ size: 10, weeks: [{ weekN: 0, active: 10 }, { weekN: 1, active: 4 }] }, 4)
    expect(out).toEqual([1, 0.4, null, null])
  })
  it("is all null for an empty cohort and caps at 100%", () => {
    expect(cohortPercents({ size: 0, weeks: [{ weekN: 0, active: 0 }] }, 2)).toEqual([null, null])
    expect(cohortPercents({ size: 2, weeks: [{ weekN: 0, active: 3 }] }, 1)).toEqual([1])
  })
})

describe("small helpers", () => {
  it("finds metrics", () => {
    const stats = [{ metric: "a", v: 1 }]
    expect(findMetric(stats, "a")?.v).toBe(1)
    expect(findMetric(stats, "b")).toBeUndefined()
  })
  it("computes shares and ratios safely", () => {
    expect(shareOf(5, 20)).toBe(0.25)
    expect(shareOf(5, 0)).toBe(0)
    expect(ratio(1, 4)).toBe(0.25)
    expect(ratio(1, 0)).toBeNull()
  })
  it("labels stores", () => {
    expect(storeLabel("app_store")).toBe("App Store")
    expect(storeLabel("some_new_store")).toBe("Some New Store")
    expect(formatByStore({ play_store: 1, app_store: 3 })).toBe("App Store: 3, Google Play: 1")
    expect(formatByStore({})).toBeNull()
  })
})
