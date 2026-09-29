import { describe, expect, it } from "vitest"

import { currentSegment, insertPastedLines, replaceCurrentName } from "./autocomplete"

describe("currentSegment", () => {
  it("is the text after the last separator", () => {
    expect(currentSegment("")).toEqual({ start: 0, segment: "" })
    expect(currentSegment("2 lbs chi")).toEqual({ start: 0, segment: "2 lbs chi" })
    expect(currentSegment("milk, eggs; 2 ba")).toEqual({ start: 11, segment: " 2 ba" })
    expect(currentSegment("milk\nbre")).toEqual({ start: 5, segment: "bre" })
    expect(currentSegment("milk,")).toEqual({ start: 5, segment: "" })
  })

  it("splits where parseLines does: not inside \"1,000\" or parentheses", () => {
    expect(currentSegment("1,000 g flo")).toEqual({ start: 0, segment: "1,000 g flo" })
    expect(currentSegment("milk, 1,000 g flo")).toEqual({ start: 5, segment: " 1,000 g flo" })
    expect(currentSegment("1,")).toEqual({ start: 2, segment: "" })
    expect(currentSegment("2 cans (15 oz, drained) bea")).toEqual({ start: 0, segment: "2 cans (15 oz, drained) bea" })
    expect(currentSegment("2 cans (15 oz, bea")).toEqual({ start: 14, segment: " bea" })
    expect(currentSegment("milk • eg")).toEqual({ start: 6, segment: " eg" })
    expect(currentSegment("milk\r\neg")).toEqual({ start: 6, segment: "eg" })
  })
})

describe("replaceCurrentName", () => {
  it("keeps the typed amount and earlier items", () => {
    expect(replaceCurrentName("2 lbs chi", "2 lbs ", "chicken breast")).toBe("2 lbs chicken breast")
    expect(replaceCurrentName("milk, 1 dozen eg", "1 dozen ", "eggs")).toBe("milk, 1 dozen eggs")
    expect(replaceCurrentName("milk\nbre", "", "bread")).toBe("milk\nbread")
    expect(replaceCurrentName("chi", "", "chickpeas")).toBe("chickpeas")
  })

  it("keeps a list marker and the whole \"1,000\" amount", () => {
    expect(replaceCurrentName("- 2 lbs chi", "2 lbs ", "chicken breast")).toBe("- 2 lbs chicken breast")
    expect(replaceCurrentName("milk\n  1. 2 lbs chi", "2 lbs ", "chicken breast")).toBe("milk\n  1. 2 lbs chicken breast")
    expect(replaceCurrentName("- chi", "", "chickpeas")).toBe("- chickpeas")
    expect(replaceCurrentName("[ ] 2 2% mi", "2 ", "2% milk")).toBe("[ ] 2 2% milk")
    expect(replaceCurrentName("1,000 g flo", "1,000 g ", "flour")).toBe("1,000 g flour")
    expect(replaceCurrentName("milk, 1,000 g flo", "1,000 g ", "flour")).toBe("milk, 1,000 g flour")
  })
})

describe("insertPastedLines", () => {
  it("turns pasted lines into comma-separated items", () => {
    expect(insertPastedLines("", 0, 0, "eggs\n2 lbs chicken\n\n")).toEqual({ text: "eggs, 2 lbs chicken", caret: 19 })
    expect(insertPastedLines("milk", 4, 4, "- eggs\r\n- bread")).toEqual({ text: "milk, eggs, bread", caret: 17 })
    expect(insertPastedLines("", 0, 0, "1. 2 lbs chicken\n2) rice\n[x] salt\n• 3 limes")).toEqual({
      text: "2 lbs chicken, rice, salt, 3 limes",
      caret: 34,
    })
    expect(insertPastedLines("milk, ", 6, 6, "eggs\nbread")).toEqual({ text: "milk, eggs, bread", caret: 17 })
  })

  it("keeps what's after the caret as its own item", () => {
    expect(insertPastedLines("milk, rice", 5, 5, "eggs\nbread")).toEqual({ text: "milk, eggs, bread, rice", caret: 17 })
    expect(insertPastedLines("milk rice", 4, 9, "eggs\nbread")).toEqual({ text: "milk, eggs, bread", caret: 17 })
  })

  it("leaves single lines to the browser", () => {
    expect(insertPastedLines("milk", 4, 4, "eggs")).toBeNull()
  })
})
