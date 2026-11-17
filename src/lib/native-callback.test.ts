import { describe, expect, it } from "vitest"

import { callbackPathFromAppLink, markAppLinkHandled, nativeCallbackUrl } from "./native-callback"

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

describe("markAppLinkHandled", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const items = new Map(Object.entries(initial))
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    }
  }

  it("handles each link once", () => {
    const storage = memoryStorage()
    expect(markAppLinkHandled("app.lazychef://auth/callback?code=a", () => storage)).toBe(true)
    expect(markAppLinkHandled("app.lazychef://auth/callback?code=a", () => storage)).toBe(false)
    expect(markAppLinkHandled("app.lazychef://auth/callback?code=b", () => storage)).toBe(true)
  })

  it("keeps only recent links", () => {
    const storage = memoryStorage()
    for (let i = 0; i < 25; i++) markAppLinkHandled(`link-${i}`, () => storage)
    expect(markAppLinkHandled("link-24", () => storage)).toBe(false)
    expect(markAppLinkHandled("link-0", () => storage)).toBe(true)
  })

  it("recovers from bad stored data", () => {
    const storage = memoryStorage({ "lazychef:handled-app-links": "{oops" })
    expect(markAppLinkHandled("link", () => storage)).toBe(true)
    expect(markAppLinkHandled("link", () => storage)).toBe(false)
  })

  it("returns null when storage isn't usable", () => {
    expect(
      markAppLinkHandled("link", () => {
        throw new Error("blocked")
      }),
    ).toBeNull()
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota")
      },
    }
    expect(markAppLinkHandled("link", () => full)).toBeNull()
  })
})
