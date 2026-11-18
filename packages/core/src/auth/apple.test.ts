import { describe, expect, it } from "vitest"

import { appleDisplayName, bytesToHex, isNewAppleOnlyAccount } from "./apple"

describe("appleDisplayName", () => {
  it("joins and trims the parts", () => {
    expect(appleDisplayName(" Sam ", "Lee")).toBe("Sam Lee")
    expect(appleDisplayName("Sam", null)).toBe("Sam")
  })
  it("is null when Apple shared nothing", () => {
    expect(appleDisplayName(null, undefined)).toBeNull()
    expect(appleDisplayName("  ", "")).toBeNull()
  })
  it("cuts to 60 characters", () => {
    expect(appleDisplayName("a".repeat(80), null)?.length).toBe(60)
  })
})

describe("bytesToHex", () => {
  it("pads each byte to two characters", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe("000fff")
  })
})

describe("isNewAppleOnlyAccount", () => {
  const now = Date.parse("2026-11-18T12:00:00Z")
  it("accepts a fresh Apple only account", () => {
    expect(isNewAppleOnlyAccount({ created_at: "2026-11-18T11:55:00Z", identities: [{ provider: "apple" }] }, now)).toBe(true)
  })
  it("refuses an old account or a linked one", () => {
    expect(isNewAppleOnlyAccount({ created_at: "2026-11-18T11:00:00Z", identities: [{ provider: "apple" }] }, now)).toBe(false)
    expect(
      isNewAppleOnlyAccount({ created_at: "2026-11-18T11:59:00Z", identities: [{ provider: "apple" }, { provider: "email" }] }, now),
    ).toBe(false)
    expect(isNewAppleOnlyAccount({ created_at: "2026-11-18T11:59:00Z", identities: [] }, now)).toBe(false)
  })
})
