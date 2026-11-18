import { describe, expect, it } from "vitest"

import { allowanceResult, isAiLimited, limitMessage } from "./ai-allowance-core"

const NOW = new Date("2026-11-18T12:00:00Z")

describe("allowanceResult", () => {
  it("goes ahead when allowed, with Pro, or when there's no answer", () => {
    expect(allowanceResult({ allowed: true, pro: false, used: 3, lim: 10, resets_at: null }, NOW)).toBeNull()
    expect(allowanceResult({ allowed: true, pro: true, used: 0, lim: 10, resets_at: null }, NOW)).toBeNull()
    expect(allowanceResult(undefined, NOW)).toBeNull()
  })

  it("returns a limit result when the free week is used up", () => {
    const result = allowanceResult({ allowed: false, pro: false, used: 10, lim: 10, resets_at: "2026-11-21T12:00:00Z" }, NOW)
    expect(result).toMatchObject({ proLimit: true, resetsAt: "2026-11-21T12:00:00Z" })
    expect(result?.error).toMatch(/10 free AI recipes/)
    expect(isAiLimited(result)).toBe(true)
  })
})

describe("limitMessage", () => {
  it("names when more come back", () => {
    expect(limitMessage("2026-11-21T12:00:00Z", NOW, "UTC")).toMatch(/come back Saturday/)
    expect(limitMessage("2026-11-18T20:00:00Z", NOW, "UTC")).toMatch(/later today/)
    expect(limitMessage("2026-11-18T12:30:00Z", NOW, "UTC")).toMatch(/within the hour/)
    expect(limitMessage(null, NOW)).toMatch(/Pro makes it unlimited/)
  })
})

describe("isAiLimited", () => {
  it("only matches limit results", () => {
    expect(isAiLimited({ error: "nope" })).toBe(false)
    expect(isAiLimited(null)).toBe(false)
    expect(isAiLimited({ error: "x", proLimit: true, resetsAt: null })).toBe(true)
  })
})
