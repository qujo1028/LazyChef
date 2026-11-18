import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { LEGACY_REDIRECTS, legacyRedirects } from "./legacy-routes"

const APP = path.join(__dirname, "..", "app", "(app)")

/** Does src/app/(app)/<route> have a page.tsx? Route params (:id) match any folder named [x]. */
function hasPage(route: string) {
  let dir = APP
  for (const part of route.split("/").filter(Boolean)) {
    if (!existsSync(dir)) return false
    const names = readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isDirectory())
    const match = part.startsWith(":") ? names.find((name) => /^\[[^\]]+\]$/.test(name)) : names.find((name) => name === part)
    if (!match) return false
    dir = path.join(dir, match)
  }
  return existsSync(path.join(dir, "page.tsx"))
}

describe("legacy redirects", () => {
  it("are permanent", () => {
    expect(legacyRedirects().every((route) => route.permanent)).toBe(true)
  })

  it("have unique sources", () => {
    const sources = LEGACY_REDIRECTS.map((route) => route.source)
    expect(new Set(sources).size).toBe(sources.length)
  })

  it("never shadow a screen that still exists", () => {
    for (const route of LEGACY_REDIRECTS) expect(hasPage(route.source), route.source).toBe(false)
  })

  it("land on screens that exist, with no redirect chains", () => {
    const sources = new Set<string>(LEGACY_REDIRECTS.map((route) => route.source))
    for (const route of LEGACY_REDIRECTS) {
      const [pathname] = route.destination.split("?")
      expect(hasPage(pathname), route.destination).toBe(true)
      expect(sources.has(pathname), route.destination).toBe(false)
    }
  })

  it("keep route params on the way through", () => {
    const edit = LEGACY_REDIRECTS.find((route) => route.source === "/recipes/:id/edit")
    expect(edit?.destination).toBe("/recipes/:id?edit=1")
  })
})
