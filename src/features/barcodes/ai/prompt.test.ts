import { describe, expect, it } from "vitest"

import { catalogCandidates, tidyMessages, tidyProduct, tidyReplySchema, toSuggestion, type TidyProduct } from "./prompt"

const MAC: TidyProduct = {
  name: "KRFT MAC&CHS ORIG 7.25OZ",
  brand: "Kraft",
  categories: ["macaroni and cheese", "pasta dishes"],
  quantity: null,
}

describe("tidyProduct", () => {
  it("keeps only name, brand, English categories and size", () => {
    expect(
      tidyProduct({
        product_name: "  KRFT   MAC&CHS ORIG 7.25OZ ",
        brands: "Kraft",
        quantity: "7.25 oz",
        categories_tags: ["en:meals", "fr:plats", "en:macaroni-and-cheese"],
      }),
    ).toEqual({ name: "KRFT MAC&CHS ORIG 7.25OZ", brand: "Kraft", categories: ["macaroni and cheese", "meals"], quantity: "7.25 oz" })
  })

  it("falls back to the generic name, and is null with no name at all", () => {
    expect(tidyProduct({ generic_name: "Cheddar" })?.name).toBe("Cheddar")
    expect(tidyProduct({ brands: "Kraft" })).toBeNull()
  })
})

describe("catalogCandidates", () => {
  it("finds library names from the name and categories, without duplicates", () => {
    const candidates = catalogCandidates(MAC)
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.length).toBeLessThanOrEqual(12)
    expect(new Set(candidates).size).toBe(candidates.length)
    expect(candidates.some((name) => name.includes("macaroni") || name.includes("cheese"))).toBe(true)
  })
})

describe("tidyMessages", () => {
  it("asks for JSON and keeps the product out of the system prompt", () => {
    const product = { ...MAC, name: "ZESTY RANCH CRUNCHERS" }
    const [system, user] = tidyMessages(product, ["macaroni"])
    expect(system.role).toBe("system")
    expect(system.content).toMatch(/JSON/)
    expect(system.content).not.toContain("ZESTY")
    expect(user.role).toBe("user")
    expect(JSON.parse(user.content)).toEqual({ product, candidates: ["macaroni"] })
  })
})

describe("tidyReplySchema", () => {
  it("accepts missing optional fields and rejects an empty name", () => {
    expect(tidyReplySchema.safeParse({ name: "mac and cheese" }).success).toBe(true)
    expect(tidyReplySchema.safeParse({ name: " " }).success).toBe(false)
  })
})

describe("toSuggestion", () => {
  it("cleans the name, keeps a candidate ingredient, and reads the model's size", () => {
    expect(toSuggestion({ name: "Mac and Cheese", ingredient: "Macaroni", size: "7.25 oz" }, MAC, ["macaroni"])).toEqual({
      name: "mac and cheese",
      ingredient: "macaroni",
      quantity: 7.25,
      unit: "oz",
      line: "7¼ oz mac and cheese",
    })
  })

  it("drops an ingredient that wasn't a candidate", () => {
    expect(toSuggestion({ name: "mac and cheese", ingredient: "lobster" }, MAC, ["macaroni"])?.ingredient).toBeNull()
  })

  it("prefers the package's own size over the model's", () => {
    const suggestion = toSuggestion({ name: "milk", size: "5 gal" }, { ...MAC, quantity: "1 gal" }, [])
    expect(suggestion).toMatchObject({ quantity: 1, unit: "gal", line: "1 gal milk" })
  })

  it("ignores a size it can't read", () => {
    expect(toSuggestion({ name: "crackers", size: "family" }, MAC, [])).toMatchObject({ quantity: null, unit: "count", line: "crackers" })
  })

  it("keeps the line to one item and gives up on an empty name", () => {
    expect(toSuggestion({ name: "chips, salsa" }, MAC, [])?.name).toBe("chips salsa")
    expect(toSuggestion({ name: "“”" }, MAC, [])).toBeNull()
  })
})
