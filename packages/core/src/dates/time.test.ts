import { describe, expect, it } from "vitest"

import { dayKey, dayLabel, groupByDay, shortTime } from "./time"

const at = (iso: string) => Date.parse(iso)
// Monday, Sep 28 2026, 18:00 UTC = 12:00 in Denver (UTC−6).
const NOW = at("2026-09-28T18:00:00Z")

describe("dayLabel", () => {
  it("says Today, Yesterday, then the date", () => {
    expect(dayLabel(at("2026-09-28T09:00:00Z"), NOW, "UTC")).toBe("Today")
    expect(dayLabel(at("2026-09-27T23:59:00Z"), NOW, "UTC")).toBe("Yesterday")
    expect(dayLabel(at("2026-09-26T12:00:00Z"), NOW, "UTC")).toBe("Sat, Sep 26")
  })

  it("adds the year for other years", () => {
    expect(dayLabel(at("2025-12-31T12:00:00Z"), NOW, "UTC")).toBe("Wed, Dec 31, 2025")
  })

  it("follows the time zone", () => {
    // 03:00 UTC on the 28th is still the evening of the 27th in Denver.
    expect(dayLabel(at("2026-09-28T03:00:00Z"), NOW, "UTC")).toBe("Today")
    expect(dayLabel(at("2026-09-28T03:00:00Z"), NOW, "America/Denver")).toBe("Yesterday")
    expect(dayKey(at("2026-09-28T03:00:00Z"), "America/Denver")).toBe("2026-09-27")
  })

  it("handles month and year boundaries", () => {
    expect(dayLabel(at("2026-12-31T12:00:00Z"), at("2027-01-01T08:00:00Z"), "UTC")).toBe("Yesterday")
  })

  it("treats a slightly-future time (clock skew) as today", () => {
    expect(dayLabel(at("2026-09-29T00:30:00Z"), NOW, "UTC")).toBe("Today")
  })
})

describe("shortTime", () => {
  it("is relative within a day, then a clock time", () => {
    expect(shortTime(NOW - 20_000, NOW)).toBe("just now")
    expect(shortTime(NOW + 5_000, NOW)).toBe("just now")
    expect(shortTime(NOW - 5 * 60_000, NOW)).toBe("5m ago")
    expect(shortTime(NOW - 3 * 3_600_000 - 10, NOW)).toBe("3h ago")
    expect(shortTime(at("2026-09-26T21:15:00Z"), NOW, "UTC")).toBe("9:15 PM")
    expect(shortTime(at("2026-09-26T21:15:00Z"), NOW, "America/Denver")).toBe("3:15 PM")
  })
})

describe("groupByDay", () => {
  it("splits newest-first items into labelled days", () => {
    const items = ["2026-09-28T17:00:00Z", "2026-09-28T01:00:00Z", "2026-09-27T20:00:00Z", "2026-09-20T12:00:00Z"]
    const days = groupByDay(items, at, NOW, "UTC")
    expect(days.map((d) => [d.label, d.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Sun, Sep 20", 1],
    ])
  })
})
