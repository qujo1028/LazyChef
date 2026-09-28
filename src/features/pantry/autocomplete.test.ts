import { describe, expect, it } from "vitest"

import { currentSegment, replaceCurrentName } from "./autocomplete"

describe("currentSegment", () => {
  it("is the text after the last separator", () => {
    expect(currentSegment("")).toEqual({ start: 0, segment: "" })
    expect(currentSegment("2 lbs chi")).toEqual({ start: 0, segment: "2 lbs chi" })
    expect(currentSegment("milk, eggs; 2 ba")).toEqual({ start: 11, segment: " 2 ba" })
    expect(currentSegment("milk\nbre")).toEqual({ start: 5, segment: "bre" })
    expect(currentSegment("milk,")).toEqual({ start: 5, segment: "" })
  })
})

describe("replaceCurrentName", () => {
  it("keeps the typed amount and earlier items", () => {
    expect(replaceCurrentName("2 lbs chi", "2 lbs ", "chicken breast")).toBe("2 lbs chicken breast")
    expect(replaceCurrentName("milk, 1 dozen eg", "1 dozen ", "eggs")).toBe("milk, 1 dozen eggs")
    expect(replaceCurrentName("milk\nbre", "", "bread")).toBe("milk\nbread")
    expect(replaceCurrentName("chi", "", "chickpeas")).toBe("chickpeas")
  })
})
