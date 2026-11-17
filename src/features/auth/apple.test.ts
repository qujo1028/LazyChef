import { describe, expect, it } from "vitest"

import { appleDisplayName, appleIdTokenInput, isAppleSignInEnabled, randomNonce, sha256Hex } from "./apple"

describe("isAppleSignInEnabled", () => {
  it("is on only for 1", () => {
    expect(isAppleSignInEnabled("1")).toBe(true)
    expect(isAppleSignInEnabled(" 1 ")).toBe(true)
    for (const value of [undefined, "", "0", "true", "yes", "11"]) {
      expect(isAppleSignInEnabled(value)).toBe(false)
    }
  })
})

describe("sha256Hex", () => {
  it("matches known digests", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})

describe("randomNonce", () => {
  it("is 64 hex characters and different each time", () => {
    const a = randomNonce()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(randomNonce()).not.toBe(a)
  })
})

describe("appleDisplayName", () => {
  it("joins the parts Apple shared", () => {
    expect(appleDisplayName("Ada", "Lovelace")).toBe("Ada Lovelace")
    expect(appleDisplayName(" Ada ", null)).toBe("Ada")
    expect(appleDisplayName(null, "Lovelace")).toBe("Lovelace")
  })

  it("is null when Apple shared nothing", () => {
    expect(appleDisplayName(null, null)).toBeNull()
    expect(appleDisplayName("  ", "")).toBeNull()
    expect(appleDisplayName(undefined, undefined)).toBeNull()
  })

  it("fits the 60-character profile limit", () => {
    expect(appleDisplayName("A".repeat(50), "B".repeat(50))).toHaveLength(60)
  })
})

describe("appleIdTokenInput", () => {
  const valid = { identityToken: "eyJ.token", rawNonce: "a".repeat(64) }

  it("accepts the minimum and normalises missing optionals to null", () => {
    const parsed = appleIdTokenInput.parse(valid)
    expect(parsed).toMatchObject({ authorizationCode: null, givenName: null, familyName: null })
  })

  it("trims names and treats blanks as missing", () => {
    const parsed = appleIdTokenInput.parse({ ...valid, givenName: " Ada ", familyName: "  ", authorizationCode: "" })
    expect(parsed.givenName).toBe("Ada")
    expect(parsed.familyName).toBeNull()
    expect(parsed.authorizationCode).toBeNull()
  })

  it("rejects a missing token or a short nonce", () => {
    expect(appleIdTokenInput.safeParse({ ...valid, identityToken: "" }).success).toBe(false)
    expect(appleIdTokenInput.safeParse({ ...valid, rawNonce: "short" }).success).toBe(false)
    expect(appleIdTokenInput.safeParse({ rawNonce: valid.rawNonce }).success).toBe(false)
  })
})
