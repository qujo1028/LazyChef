import { describe, expect, it } from "vitest"

import { safeNext } from "./safe-next"

describe("safeNext", () => {
  it.each(["/", "/pantry", "/join/K7QXM2PA", "/pantry?tab=fridge#top", "/a%2F%2Fb"])("keeps %s", (value) => {
    expect(safeNext(value)).toBe(value)
  })

  it.each([
    null,
    undefined,
    42,
    "",
    "pantry",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/pantry\\..\\..\\evil",
    "javascript:alert(1)",
  ])("rejects %j", (value) => {
    expect(safeNext(value)).toBe("/")
    expect(safeNext(value, "/onboarding")).toBe("/onboarding")
  })
})
