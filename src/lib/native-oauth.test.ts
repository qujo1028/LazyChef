import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/native-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/native-auth")>()),
  hasNativeAuth: () => false,
  LazyChefAuth: {},
}))

import { callbackPathFromAuthSession, NATIVE_OAUTH_ERROR } from "./native-oauth"

describe("callbackPathFromAuthSession", () => {
  it("turns the returned callback URL into the web callback path", () => {
    expect(callbackPathFromAuthSession("app.lazychef://auth/callback?next=%2Fpantry&code=abc")).toBe(
      "/auth/callback?next=%2Fpantry&code=abc",
    )
  })

  it("rejects URLs that aren't sign-in links", () => {
    expect(() => callbackPathFromAuthSession("app.lazychef://other?code=abc")).toThrow(NATIVE_OAUTH_ERROR)
    expect(() => callbackPathFromAuthSession("https://evil.example/auth/callback?code=abc")).toThrow(NATIVE_OAUTH_ERROR)
    expect(() => callbackPathFromAuthSession("not a url")).toThrow(NATIVE_OAUTH_ERROR)
  })
})
