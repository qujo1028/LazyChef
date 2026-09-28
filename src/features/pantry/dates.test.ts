import { describe, expect, it } from "vitest"

import { addDays, daysBetween, expiryInfo, localDateKey, timeAgo } from "./dates"

describe("dates", () => {
  it("formats the local calendar day", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
  })

  it("counts calendar days across months, years and DST", () => {
    expect(daysBetween("2026-09-28", "2026-10-01")).toBe(3)
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1)
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2)
    expect(daysBetween("2026-09-28", "2026-09-20")).toBe(-8)
  })

  it("adds days", () => {
    expect(addDays("2026-09-28", 3)).toBe("2026-10-01")
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("labels expiry dates", () => {
    const today = "2026-09-28"
    expect(expiryInfo(null, today)).toBeNull()
    expect(expiryInfo("2026-09-27", today)).toMatchObject({ label: "Expired", tone: "expired", days: -1 })
    expect(expiryInfo("2026-09-28", today)).toMatchObject({ label: "Expires today", tone: "soon" })
    expect(expiryInfo("2026-09-29", today)).toMatchObject({ label: "Expires tomorrow", tone: "soon" })
    expect(expiryInfo("2026-10-01", today)).toMatchObject({ label: "Expires in 3d", tone: "soon" })
    expect(expiryInfo("2026-10-02", today)).toMatchObject({ label: "Expires in 4d", tone: "later" })
  })

  it("says how long ago", () => {
    const now = Date.parse("2026-09-28T12:00:00Z")
    expect(timeAgo("2026-09-28T11:59:30Z", now)).toBe("just now")
    expect(timeAgo("2026-09-28T11:15:00Z", now)).toBe("45m ago")
    expect(timeAgo("2026-09-28T02:00:00Z", now)).toBe("10h ago")
    expect(timeAgo("2026-09-26T12:00:00Z", now)).toBe("2d ago")
    expect(timeAgo("2026-09-07T12:00:00Z", now)).toBe("3w ago")
    expect(timeAgo("2026-05-28T12:00:00Z", now)).toBe("4mo ago")
    expect(timeAgo("2024-09-28T12:00:00Z", now)).toBe("2y ago")
    expect(timeAgo("2026-09-29T12:00:00Z", now)).toBe("just now")
  })
})
