import { describe, expect, it } from "vitest"

import { buildHeatmap, HEATMAP_WEEKS, type HeatmapRow } from "./heatmap"

let batch = 1
function cook(createdAt: string, actorId = "alex", items = 1, batchId = batch++): HeatmapRow[] {
  return Array.from({ length: items }, () => ({ action: "cooked", actorId, createdAt, batchId }))
}

// Wednesday, Nov 4 2026, noon in New York (after the Nov 1 DST change).
const NOW = Date.parse("2026-11-04T17:00:00Z")
const NY = "America/New_York"

function cell(map: ReturnType<typeof buildHeatmap>, day: string) {
  return map.weeks.flat().find((c) => c.day === day)
}

describe("buildHeatmap", () => {
  it("lays out 16 Monday-first weeks ending with this week", () => {
    const map = buildHeatmap([], NOW, NY)
    expect(map.weeks).toHaveLength(HEATMAP_WEEKS)
    expect(map.weeks.every((week) => week.length === 7)).toBe(true)
    expect(map.weeks[0][0].day).toBe("2026-07-20")
    expect(map.weeks.at(-1)![0].day).toBe("2026-11-02")
    expect(map.weeks.at(-1)![6].day).toBe("2026-11-08")
    expect(cell(map, "2026-11-04")?.future).toBe(false)
    expect(cell(map, "2026-11-05")?.future).toBe(true)
  })

  it("counts a person's batch once however many ingredients it deducted", () => {
    const rows = [...cook("2026-11-03T23:00:00Z", "alex", 4), ...cook("2026-11-03T23:30:00Z", "blair", 2)]
    const c = cell(buildHeatmap(rows, NOW, NY), "2026-11-03")!
    expect(c.cooks).toBe(2)
    expect(c.level).toBe(2)
  })

  it("caps the level at 3", () => {
    const rows = [1, 2, 3, 4].flatMap(() => cook("2026-11-03T18:00:00Z"))
    expect(cell(buildHeatmap(rows, NOW, NY), "2026-11-03")).toMatchObject({ cooks: 4, level: 3 })
  })

  it("ignores shopping rows and future-dated rows", () => {
    const rows: HeatmapRow[] = [
      { action: "shopped", actorId: "alex", createdAt: "2026-11-03T18:00:00Z", batchId: 99 },
      ...cook("2026-11-06T18:00:00Z"),
    ]
    const map = buildHeatmap(rows, NOW, NY)
    expect(cell(map, "2026-11-03")?.cooks).toBe(0)
    expect(cell(map, "2026-11-06")?.cooks).toBe(0)
    expect(map.cookDaysLast28).toBe(0)
  })

  it("puts a late-evening cook on the viewer's day, not the UTC day", () => {
    // 11:30 PM EST on Nov 1 is already Nov 2 in UTC.
    const map = buildHeatmap(cook("2026-11-02T04:30:00Z"), NOW, NY)
    expect(cell(map, "2026-11-01")?.cooks).toBe(1)
    expect(cell(map, "2026-11-02")?.cooks).toBe(0)
    expect(cell(buildHeatmap(cook("2026-11-02T04:30:00Z"), NOW, "UTC"), "2026-11-02")?.cooks).toBe(1)
  })

  it("keeps the repeated 1:30 AM of the fall-back day on one cell with no shifted days", () => {
    const rows = [...cook("2026-11-01T05:30:00Z"), ...cook("2026-11-01T06:30:00Z")]
    const map = buildHeatmap(rows, NOW, NY)
    expect(cell(map, "2026-11-01")?.cooks).toBe(2)
    const days = map.weeks.flat().map((c) => c.day)
    expect(new Set(days).size).toBe(days.length)
    expect(days.at(0)).toBe("2026-07-20")
  })

  it("handles the spring-forward day", () => {
    // Mar 8 2026 is a 23 hour day in New York. Now is Mar 10.
    const now = Date.parse("2026-03-10T16:00:00Z")
    // 1:30 AM EST (before the jump) and 11:30 PM EDT (after it) are both Mar 8.
    const rows = [...cook("2026-03-08T06:30:00Z"), ...cook("2026-03-09T03:30:00Z")]
    const map = buildHeatmap(rows, now, NY)
    expect(cell(map, "2026-03-08")?.cooks).toBe(2)
    expect(cell(map, "2026-03-09")?.cooks).toBe(0)
    expect(map.weeks.at(-1)![0].day).toBe("2026-03-09")
  })

  it("counts distinct cook days in the last 28 days, today included", () => {
    const rows = [
      ...cook("2026-11-04T15:00:00Z"), // today
      ...cook("2026-11-04T16:00:00Z"), // same day, second cook
      ...cook("2026-10-08T15:00:00Z"), // 27 days ago: in
      ...cook("2026-10-07T15:00:00Z"), // 28 days ago: out
    ]
    expect(buildHeatmap(rows, NOW, NY).cookDaysLast28).toBe(2)
  })
})
