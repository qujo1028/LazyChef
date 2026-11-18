import { describe, expect, it } from "vitest"

import { findListLine } from "./scan-match"

const line = (id: string, name: string, checked = false) => ({ id, name, checked_at: checked ? "2026-09-30T00:00:00Z" : null })

describe("findListLine", () => {
  const list = [line("1", "Milk"), line("2", "brown eggs"), line("3", "whole milk", true), line("4", "chicken breast"), line("5", "Tomatoes")]

  it("matches the same name, ignoring case and plurals", () => {
    expect(findListLine(list, "tomato")?.id).toBe("5")
    expect(findListLine(list, "Chicken Breasts")?.id).toBe("4")
  })
  it("matches a general line for a specific product, skipping lines already in the cart", () => {
    expect(findListLine(list, "whole milk")?.id).toBe("1")
    expect(findListLine(list, "boneless chicken breast")?.id).toBe("4")
  })
  it("matches a specific line for a general product", () => {
    expect(findListLine(list, "eggs")?.id).toBe("2")
  })
  it("prefers the closest line", () => {
    expect(findListLine([line("a", "milk"), line("b", "oat milk")], "oat milk")?.id).toBe("b")
    expect(findListLine([line("a", "milk"), line("b", "whole milk")], "organic whole milk")?.id).toBe("b")
  })
  it("returns null when nothing fits", () => {
    expect(findListLine(list, "coffee")).toBeNull()
    expect(findListLine(list, "")).toBeNull()
  })
})
