import { describe, expect, it } from "vitest"

import { callbackPathFromAppLink, nativeCallbackUrl } from "./native-callback"

describe("nativeCallbackUrl", () => {
  it("carries where to go after signing in", () => {
    expect(nativeCallbackUrl("/join/ABC?x=1")).toBe("app.lazychef://auth/callback?next=%2Fjoin%2FABC%3Fx%3D1")
  })
})

describe("callbackPathFromAppLink", () => {
  it("turns the app link Supabase returns into the web callback", () => {
    expect(callbackPathFromAppLink("app.lazychef://auth/callback?next=%2Fpantry&code=abc")).toBe(
      "/auth/callback?next=%2Fpantry&code=abc",
    )
  })

  it("passes provider errors through", () => {
    expect(callbackPathFromAppLink("app.lazychef://auth/callback?error=access_denied")).toBe(
      "/auth/callback?error=access_denied",
    )
  })

  it("ignores other links", () => {
    expect(callbackPathFromAppLink("app.lazychef://something-else?code=abc")).toBeNull()
    expect(callbackPathFromAppLink("https://evil.example/auth/callback?code=abc")).toBeNull()
    expect(callbackPathFromAppLink("not a url")).toBeNull()
  })
})
