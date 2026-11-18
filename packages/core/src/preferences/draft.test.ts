import { describe, expect, it } from "vitest"

import { EMPTY_DRAFT, hasPending, parseDraft } from "./draft"

describe("parseDraft", () => {
  it("reads missing, empty or broken storage as the empty draft", () => {
    expect(parseDraft(null)).toBe(EMPTY_DRAFT)
    expect(parseDraft(undefined)).toBe(EMPTY_DRAFT)
    expect(parseDraft("")).toBe(EMPTY_DRAFT)
    expect(parseDraft("{not json")).toBe(EMPTY_DRAFT)
  })

  it("keeps good fields and falls back field by field", () => {
    const draft = parseDraft(JSON.stringify({ prefsSaved: true, touched: "yes", staples: "nope" }))
    expect(draft.prefsSaved).toBe(true)
    expect(draft.touched).toBe(false)
    expect(draft.staples).toEqual([])
    expect(draft.prefs).toEqual(EMPTY_DRAFT.prefs)
  })

  it("round-trips a saved draft", () => {
    const saved = { ...EMPTY_DRAFT, touched: true }
    expect(parseDraft(JSON.stringify(saved))).toEqual(saved)
  })
})

describe("hasPending", () => {
  it("is true for unsaved answers or waiting staples only", () => {
    expect(hasPending(EMPTY_DRAFT)).toBe(false)
    expect(hasPending({ ...EMPTY_DRAFT, touched: true })).toBe(true)
    expect(hasPending({ ...EMPTY_DRAFT, touched: true, prefsSaved: true })).toBe(false)
  })
})
