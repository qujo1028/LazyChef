import { describe, expect, it } from "vitest"

import { DEFAULT_SAVINGS, yearlySavings } from "./plans"
import { FREE_STATUS, type ProStatus } from "./status"
import { proStatusLine } from "./status-line"

describe("yearlySavings", () => {
  it("compares a year with 12 months", () => {
    expect(DEFAULT_SAVINGS).toBe(58)
    expect(yearlySavings(59.88, 4.99)).toBeNull()
    expect(yearlySavings(0, 4.99)).toBeNull()
    expect(yearlySavings(24.99, 0)).toBeNull()
  })
})

describe("proStatusLine", () => {
  const sub = (fields: Partial<ProStatus>): ProStatus => ({
    ...FREE_STATUS,
    householdPro: true,
    mePro: true,
    meSource: "subscription",
    expiresAt: "2026-11-11T10:00:00Z",
    willRenew: true,
    periodType: "normal",
    ...fields,
  })

  it("covers each state", () => {
    expect(proStatusLine(FREE_STATUS, "UTC")).toBe("You're on the free plan.")
    expect(proStatusLine(sub({ periodType: "trial" }), "UTC")).toBe("Free trial until Nov 11, then your plan starts.")
    expect(proStatusLine(sub({ periodType: "trial", willRenew: false }), "UTC")).toBe("Free trial until Nov 11. It won't renew.")
    expect(proStatusLine(sub({}), "UTC")).toBe("Renews Nov 11.")
    expect(proStatusLine(sub({ willRenew: false }), "UTC")).toBe("Pro until Nov 11. It won't renew.")
    expect(proStatusLine(sub({ expiresAt: null }), "UTC")).toBe("You have Pro for life.")
    expect(proStatusLine(sub({ billingIssueAt: "2026-11-11T10:00:00Z" }), "UTC")).toMatch(/problem with your payment/)
    expect(proStatusLine(sub({ meSource: "comp", expiresAt: null }), "UTC")).toBe("Pro is on the house. Enjoy!")
    expect(proStatusLine({ ...FREE_STATUS, householdPro: true, sponsorName: "Alex" }, "UTC")).toBe(
      "Alex's Pro covers everyone in this household.",
    )
  })

  it("uses the viewer's time zone", () => {
    expect(proStatusLine(sub({ expiresAt: "2026-11-11T02:00:00Z" }), "America/Denver")).toBe("Renews Nov 10.")
  })
})
