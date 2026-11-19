import { describe, expect, it } from "vitest"

import { expiringSoon, type ExpiringInput } from "./expiring"

const today = "2026-11-18"
const item = (name: string, expires_on: string | null, quantity: number | null = 1, is_staple = false): ExpiringInput => ({
  name,
  expires_on,
  quantity,
  is_staple,
})

describe("expiringSoon", () => {
  it("is null when nothing has a date in range", () => {
    expect(expiringSoon([], today)).toBeNull()
    expect(expiringSoon([item("Rice", null), item("Jam", "2026-12-30")], today)).toBeNull()
  })

  it("names a single item", () => {
    expect(expiringSoon([item("Milk", today)], today)).toEqual({ count: 1, text: "Milk expires today" })
    expect(expiringSoon([item("Milk", "2026-11-19")], today)?.text).toBe("Milk expires tomorrow")
    expect(expiringSoon([item("Milk", "2026-11-21")], today)?.text).toBe("Milk expires in 3 days")
  })

  it("counts several items", () => {
    expect(expiringSoon([item("Milk", today), item("Eggs", "2026-11-22")], today)).toEqual({
      count: 2,
      text: "2 things expire this week",
    })
  })

  it("includes day 7 and excludes day 8", () => {
    expect(expiringSoon([item("A", "2026-11-25")], today)?.count).toBe(1)
    expect(expiringSoon([item("A", "2026-11-26")], today)).toBeNull()
  })

  it("counts items already past their date", () => {
    expect(expiringSoon([item("Milk", "2026-11-10")], today)?.text).toBe("Milk is past its date")
    expect(expiringSoon([item("Milk", "2026-11-10"), item("Eggs", "2026-11-20")], today)?.text).toBe(
      "2 things need using up",
    )
  })

  it("skips items that ran out and staples, but not untracked amounts", () => {
    expect(expiringSoon([item("Milk", today, 0), item("Salt", today, 1, true)], today)).toBeNull()
    expect(expiringSoon([item("Milk", today, null)], today)?.count).toBe(1)
  })
})
