import { describe, expect, it } from "vitest"

import { LUNCH_MAIN_MINUTES as CORE_LUNCH_MAIN_MINUTES, MAX_QUERY_LENGTH as CORE_MAX_QUERY_LENGTH } from "@lazychef/core/recipes/filters"
import { MAX_QUERY_NAMES as CORE_MAX_QUERY_NAMES } from "@lazychef/core/recipes/match"

import { LUNCH_MAIN_MINUTES, MAX_QUERY_LENGTH, MAX_QUERY_NAMES, parseRequest } from "./validate.ts"

const HOUSEHOLD = "4f7c2a1e-9b3d-4c5e-8f6a-1b2c3d4e5f60"
const suggest = (extra: Record<string, unknown> = {}) => ({
  action: "suggest",
  householdId: HOUSEHOLD,
  names: ["eggs"],
  filters: { type: null, maxTime: null, query: null },
  ...extra,
})

describe("parseRequest", () => {
  it("keeps its limits in step with packages/core", () => {
    expect(MAX_QUERY_NAMES).toBe(CORE_MAX_QUERY_NAMES)
    expect(MAX_QUERY_LENGTH).toBe(CORE_MAX_QUERY_LENGTH)
    expect(LUNCH_MAIN_MINUTES).toBe(CORE_LUNCH_MAIN_MINUTES)
  })

  it("accepts the three actions", () => {
    expect(parseRequest({ action: "quota" })).toEqual({ ok: true, request: { action: "quota" } })
    expect(parseRequest(suggest())).toEqual({
      ok: true,
      request: { action: "suggest", householdId: HOUSEHOLD, names: ["eggs"], filters: { type: null, maxTime: null, query: null } },
    })
    expect(parseRequest({ action: "info", householdId: HOUSEHOLD, ids: [1, 2, 2] })).toEqual({
      ok: true,
      request: { action: "info", householdId: HOUSEHOLD, ids: [1, 2] },
    })
  })

  it("refuses bodies that aren't requests", () => {
    for (const body of [undefined, null, "suggest", [], 1, {}, { action: "delete" }, { action: "__proto__" }]) {
      expect(parseRequest(body).ok).toBe(false)
    }
  })

  it("needs a household id that's a uuid", () => {
    for (const householdId of [undefined, "", "abc", 1, `${HOUSEHOLD}'`, `${HOUSEHOLD} or 1=1`]) {
      expect(parseRequest(suggest({ householdId })).ok).toBe(false)
      expect(parseRequest({ action: "info", householdId, ids: [1] }).ok).toBe(false)
    }
  })

  it("checks and cleans names", () => {
    expect(parseRequest(suggest({ names: "eggs" })).ok).toBe(false)
    expect(parseRequest(suggest({ names: [1] })).ok).toBe(false)
    expect(parseRequest(suggest({ names: ["x".repeat(101)] })).ok).toBe(false)
    expect(parseRequest(suggest({ names: Array.from({ length: 61 }, (_, i) => `n${i}`) })).ok).toBe(false)
    expect(parseRequest(suggest({ names: Array.from({ length: 60 }, (_, i) => `n${i}`) })).ok).toBe(true)
    const parsed = parseRequest(suggest({ names: ["  Eggs ", "salt,pepper", "eggs", "\u0000", "a\nb"] }))
    expect(parsed.ok && parsed.request.action === "suggest" && parsed.request.names).toEqual(["eggs", "salt pepper", "a b"])
  })

  it("checks filters", () => {
    expect(parseRequest(suggest({ filters: undefined })).ok).toBe(true)
    expect(parseRequest(suggest({ filters: "x" })).ok).toBe(false)
    expect(parseRequest(suggest({ filters: { type: "pizza" } })).ok).toBe(false)
    expect(parseRequest(suggest({ filters: { type: 1 } })).ok).toBe(false)
    for (const maxTime of [0, -5, 1.5, "30", 100_000]) expect(parseRequest(suggest({ filters: { maxTime } })).ok).toBe(false)
    expect(parseRequest(suggest({ filters: { query: 5 } })).ok).toBe(false)
    expect(parseRequest(suggest({ filters: { query: "x".repeat(501) } })).ok).toBe(false)

    const parsed = parseRequest(suggest({ filters: { type: "breakfast", maxTime: 15, query: "  Oat   " + "s".repeat(100) } }))
    expect(parsed.ok && parsed.request.action === "suggest" && parsed.request.filters).toEqual({
      type: "breakfast",
      maxTime: 15,
      query: ("Oat " + "s".repeat(100)).slice(0, 80),
    })
    const blank = parseRequest(suggest({ filters: { query: "   " } }))
    expect(blank.ok && blank.request.action === "suggest" && blank.request.filters.query).toBeNull()
  })

  it("turns lunch into a quick main course, like the web", () => {
    const lunch = parseRequest(suggest({ filters: { type: "lunch", maxTime: null, query: null } }))
    expect(lunch.ok && lunch.request.action === "suggest" && lunch.request.filters).toEqual({ type: "main course", maxTime: 30, query: null })
    const quick = parseRequest(suggest({ filters: { type: "lunch", maxTime: 15, query: null } }))
    expect(quick.ok && quick.request.action === "suggest" && quick.request.filters.maxTime).toBe(15)
  })

  it("checks ids", () => {
    for (const ids of [undefined, "1", [0], [-1], [1.5], ["1"], [Number.MAX_SAFE_INTEGER + 1], Array.from({ length: 21 }, (_, i) => i + 1)]) {
      expect(parseRequest({ action: "info", householdId: HOUSEHOLD, ids }).ok).toBe(false)
    }
    expect(parseRequest({ action: "info", householdId: HOUSEHOLD, ids: Array.from({ length: 20 }, (_, i) => i + 1) }).ok).toBe(true)
  })
})
