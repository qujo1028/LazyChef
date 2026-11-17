import { describe, expect, it } from "vitest"

import { hasNativeAuth, isCanceled } from "./native-auth"

describe("isCanceled", () => {
  it("matches the plugin's CANCELED rejection", () => {
    const error = Object.assign(new Error("The user canceled sign-in"), { code: "CANCELED" })
    expect(isCanceled(error)).toBe(true)
    expect(isCanceled({ code: "CANCELED" })).toBe(true)
  })

  it("ignores other errors and non-errors", () => {
    expect(isCanceled(Object.assign(new Error("boom"), { code: "UNIMPLEMENTED" }))).toBe(false)
    expect(isCanceled(new Error("CANCELED"))).toBe(false)
    expect(isCanceled("CANCELED")).toBe(false)
    expect(isCanceled(null)).toBe(false)
    expect(isCanceled(undefined)).toBe(false)
  })
})

describe("hasNativeAuth", () => {
  it("is false outside the iOS app", () => {
    expect(hasNativeAuth()).toBe(false)
  })
})
