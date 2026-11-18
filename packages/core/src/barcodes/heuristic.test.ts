import { describe, expect, it } from "vitest"

import { looksMessy } from "./heuristic"

describe("looksMessy", () => {
  it("flags shouting, abbreviated names with sizes", () => {
    expect(looksMessy({ name: "krft mac&chs orig", printed: "KRFT MAC&CHS ORIG 7.25OZ", brands: "Kraft" })).toBe(true)
  })

  it("flags all caps on its own", () => {
    expect(looksMessy({ name: "zesty ranch crunchers", printed: "ZESTY RANCH CRUNCHERS" })).toBe(true)
  })

  it("flags sizes and digits", () => {
    expect(looksMessy({ name: "lime fizz", printed: "Lime Fizz 12 x 355ml" })).toBe(true)
    expect(looksMessy({ name: "protein bar 2", printed: "Protein Bar 2" })).toBe(true)
  })

  it("flags abbreviations", () => {
    expect(looksMessy({ name: "orig. crackers", printed: "Orig. Crackers" })).toBe(true)
    expect(looksMessy({ name: "chkn strips", printed: "Chkn Strips" })).toBe(true)
  })

  it("flags long marketing names", () => {
    const name = "original flavor macaroni and cheese dinner family size"
    expect(looksMessy({ name, printed: name })).toBe(true)
  })

  it("flags brand words left in the name, unless the brand is the product", () => {
    expect(looksMessy({ name: "kraft macaroni dinner", printed: "Macaroni Dinner", brands: "Kraft, Kraft Heinz" })).toBe(true)
    expect(looksMessy({ name: "cheerios", printed: "Cheerios", brands: "Cheerios, General Mills" })).toBe(false)
  })

  it("leaves tidy names and library matches alone", () => {
    expect(looksMessy({ name: "chicken noodle soup", printed: "CHICKEN NOODLE SOUP" })).toBe(false)
    expect(looksMessy({ name: "eggs", printed: "KIRKLAND SIGNATURE LARGE BROWN EGGS 24 CT" })).toBe(false)
    expect(looksMessy({ name: "oat milk", printed: "Oat Milk", brands: "Oatly" })).toBe(false)
    expect(looksMessy({ name: "chili crisp", printed: "Chili Crisp" })).toBe(false)
    expect(looksMessy({ name: "", printed: "" })).toBe(false)
  })
})
