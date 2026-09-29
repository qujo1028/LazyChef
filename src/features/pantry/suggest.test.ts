import { describe, expect, it } from "vitest"

import { matchRange, replaceNameAtCaret, suggestionQuery } from "./suggest"

const atEnd = (text: string) => suggestionQuery(text, text.length)

describe("suggestionQuery", () => {
  it("reads the item being typed at the end", () => {
    expect(atEnd("2 lbs chi")).toEqual({ name: "chi", amountText: "2 lbs " })
    expect(atEnd("milk, eg")).toEqual({ name: "eg", amountText: "" })
    expect(atEnd("milk\n1 dozen eg")).toEqual({ name: "eg", amountText: "1 dozen " })
    expect(atEnd("Chi ")).toEqual({ name: "chi", amountText: "" })
  })

  it("works for an earlier item when the caret is at its end", () => {
    expect(suggestionQuery("chi, milk", 3)).toEqual({ name: "chi", amountText: "" })
    expect(suggestionQuery("chi  ; milk", 3)).toEqual({ name: "chi", amountText: "" })
  })

  it("has nothing to look up without a name, inside a word, or after a trailing amount", () => {
    expect(atEnd("")).toBeNull()
    expect(atEnd("milk, ")).toBeNull()
    expect(atEnd("2 ")).toBeNull()
    expect(suggestionQuery("chicken", 3)).toBeNull()
    expect(atEnd("eggs x12")).toBeNull()
  })
})

describe("replaceNameAtCaret", () => {
  it("swaps the name and keeps the amount and the other items", () => {
    expect(replaceNameAtCaret("2 lbs chi", 9, "2 lbs ", "chicken breast")).toEqual({
      text: "2 lbs chicken breast",
      caret: 20,
    })
    expect(replaceNameAtCaret("milk, 1 dozen eg", 16, "1 dozen ", "eggs")).toEqual({
      text: "milk, 1 dozen eggs",
      caret: 18,
    })
    expect(replaceNameAtCaret("chi, milk", 3, "", "chickpeas")).toEqual({ text: "chickpeas, milk", caret: 9 })
  })
})

describe("matchRange", () => {
  it("finds the typed text in a suggestion", () => {
    expect(matchRange("chicken breast", "chi")).toEqual([0, 3])
    expect(matchRange("black beans", "BEAN")).toEqual([6, 10])
    expect(matchRange("salt", "pep")).toBeNull()
    expect(matchRange("salt", " ")).toBeNull()
  })
})
