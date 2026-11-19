import { describe, expect, it } from "vitest"

import { greeting } from "./greeting"

const at = (iso: string) => new Date(iso)

describe("greeting", () => {
  it("picks the part of day in the viewer's zone", () => {
    const now = at("2026-11-18T15:00:00Z") // 10:00 in New York, 07:00 in Los Angeles, 00:00 in Tokyo next day
    expect(greeting(now, "America/New_York", "Sam")).toBe("Good morning, Sam")
    expect(greeting(now, "America/Los_Angeles", "Sam")).toBe("Good morning, Sam")
    expect(greeting(now, "Asia/Tokyo", "Sam")).toBe("Good evening, Sam")
    expect(greeting(at("2026-11-18T14:00:00Z"), "UTC", "Sam")).toBe("Good afternoon, Sam")
  })

  it("has the boundaries at 5, 12 and 17", () => {
    expect(greeting(at("2026-11-18T04:59:00Z"), "UTC", null)).toBe("Good evening")
    expect(greeting(at("2026-11-18T05:00:00Z"), "UTC", null)).toBe("Good morning")
    expect(greeting(at("2026-11-18T11:59:00Z"), "UTC", null)).toBe("Good morning")
    expect(greeting(at("2026-11-18T12:00:00Z"), "UTC", null)).toBe("Good afternoon")
    expect(greeting(at("2026-11-18T16:59:00Z"), "UTC", null)).toBe("Good afternoon")
    expect(greeting(at("2026-11-18T17:00:00Z"), "UTC", null)).toBe("Good evening")
  })

  it("treats midnight as evening", () => {
    expect(greeting(at("2026-11-18T00:30:00Z"), "UTC", null)).toBe("Good evening")
  })

  it("uses the first word of the name only", () => {
    expect(greeting(at("2026-11-18T09:00:00Z"), "UTC", "  Ada  Lovelace ")).toBe("Good morning, Ada")
  })

  it("drops the name when there is none", () => {
    expect(greeting(at("2026-11-18T09:00:00Z"), "UTC", null)).toBe("Good morning")
    expect(greeting(at("2026-11-18T09:00:00Z"), "UTC", "   ")).toBe("Good morning")
  })
})
