import { describe, expect, it } from "vitest"

import { inAppBrowserUrl, type LinkClick } from "./external-link"

const BASE = "https://lazychef-gamma.vercel.app/recipes/42"
const TAP: LinkClick = {
  button: 0,
  defaultPrevented: false,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
}

describe("inAppBrowserUrl", () => {
  it("opens links to other websites", () => {
    expect(inAppBrowserUrl("https://www.themealdb.com/", BASE, TAP)).toBe("https://www.themealdb.com/")
    expect(inAppBrowserUrl("http://example.com/a?b=1#c", BASE, TAP)).toBe("http://example.com/a?b=1#c")
  })

  it("leaves LazyChef's own pages alone", () => {
    expect(inAppBrowserUrl("/pantry", BASE, TAP)).toBeNull()
    expect(inAppBrowserUrl("../privacy", BASE, TAP)).toBeNull()
    expect(inAppBrowserUrl("#steps", BASE, TAP)).toBeNull()
    expect(inAppBrowserUrl("https://lazychef-gamma.vercel.app/support", BASE, TAP)).toBeNull()
  })

  it("treats a different port or scheme as another site", () => {
    expect(inAppBrowserUrl("http://lazychef-gamma.vercel.app/", BASE, TAP)).toBe("http://lazychef-gamma.vercel.app/")
    expect(inAppBrowserUrl("https://lazychef-gamma.vercel.app:8443/", BASE, TAP)).not.toBeNull()
  })

  it("leaves mailto:, tel: and other schemes alone", () => {
    expect(inAppBrowserUrl("mailto:help@example.com", BASE, TAP)).toBeNull()
    expect(inAppBrowserUrl("tel:+15555550123", BASE, TAP)).toBeNull()
    expect(inAppBrowserUrl("javascript:void(0)", BASE, TAP)).toBeNull()
  })

  it("ignores missing or malformed hrefs", () => {
    expect(inAppBrowserUrl(null, BASE, TAP)).toBeNull()
    expect(inAppBrowserUrl("", BASE, TAP)).toBeNull()
    expect(inAppBrowserUrl("https://exa mple.com", BASE, TAP)).toBeNull()
  })

  it("ignores clicks that are already handled, modified or not the main button", () => {
    const href = "https://example.com/"
    expect(inAppBrowserUrl(href, BASE, { ...TAP, defaultPrevented: true })).toBeNull()
    expect(inAppBrowserUrl(href, BASE, { ...TAP, button: 1 })).toBeNull()
    expect(inAppBrowserUrl(href, BASE, { ...TAP, metaKey: true })).toBeNull()
    expect(inAppBrowserUrl(href, BASE, { ...TAP, ctrlKey: true })).toBeNull()
    expect(inAppBrowserUrl(href, BASE, { ...TAP, shiftKey: true })).toBeNull()
    expect(inAppBrowserUrl(href, BASE, { ...TAP, altKey: true })).toBeNull()
  })

  it("ignores download links", () => {
    expect(inAppBrowserUrl("https://example.com/file.pdf", BASE, TAP, true)).toBeNull()
  })
})
