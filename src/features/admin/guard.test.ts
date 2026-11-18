import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/features/household/queries", () => ({ requireViewer: vi.fn() }))

import { isAdminEmail, parseAdminEmails } from "./guard"

describe("parseAdminEmails", () => {
  it("is empty when unset or blank", () => {
    expect(parseAdminEmails(undefined).size).toBe(0)
    expect(parseAdminEmails(null).size).toBe(0)
    expect(parseAdminEmails("").size).toBe(0)
    expect(parseAdminEmails("  ,  , ").size).toBe(0)
  })

  it("trims, lowercases and splits on commas", () => {
    expect([...parseAdminEmails(" Ada@Example.com , bob@example.com,,")]).toEqual([
      "ada@example.com",
      "bob@example.com",
    ])
  })
})

describe("isAdminEmail", () => {
  it("fails closed when ADMIN_EMAILS is unset or empty", () => {
    expect(isAdminEmail("ada@example.com", undefined)).toBe(false)
    expect(isAdminEmail("ada@example.com", null)).toBe(false)
    expect(isAdminEmail("ada@example.com", "")).toBe(false)
    expect(isAdminEmail("ada@example.com", "   ")).toBe(false)
  })

  it("rejects a missing or blank email", () => {
    expect(isAdminEmail(null, "ada@example.com")).toBe(false)
    expect(isAdminEmail(undefined, "ada@example.com")).toBe(false)
    expect(isAdminEmail("", "ada@example.com")).toBe(false)
    expect(isAdminEmail("  ", " , ")).toBe(false)
  })

  it("ignores case and surrounding whitespace", () => {
    expect(isAdminEmail("ADA@example.COM", "ada@Example.com")).toBe(true)
    expect(isAdminEmail(" ada@example.com ", "  ada@example.com  ")).toBe(true)
  })

  it("matches any of several emails", () => {
    const raw = "ada@example.com, bob@example.com ,carol@example.com"
    expect(isAdminEmail("bob@example.com", raw)).toBe(true)
    expect(isAdminEmail("carol@example.com", raw)).toBe(true)
    expect(isAdminEmail("dave@example.com", raw)).toBe(false)
  })

  it("matches whole addresses only", () => {
    expect(isAdminEmail("da@example.com", "ada@example.com")).toBe(false)
    expect(isAdminEmail("ada@example.com", "ada@example.com.evil")).toBe(false)
  })
})
