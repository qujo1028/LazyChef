import { describe, expect, it } from "vitest"

import type { CookLine } from "./cook"
import { clampServings, scaleCookLines, scaleFactor, scaleOriginal } from "./scale"

describe("scaleFactor", () => {
  it("is chosen over base, and 1 without a base", () => {
    expect(scaleFactor(8, 4)).toBe(2)
    expect(scaleFactor(2, 4)).toBe(0.5)
    expect(scaleFactor(3, null)).toBe(1)
    expect(scaleFactor(3, 0)).toBe(1)
  })
  it("clamps servings", () => {
    expect(clampServings(0)).toBe(1)
    expect(clampServings(500)).toBe(48)
  })
})

describe("scaleOriginal", () => {
  it("leaves the line alone at 1x", () => {
    expect(scaleOriginal("2 cups flour", 1)).toBe("2 cups flour")
  })
  it("scales whole numbers and fixes the unit word", () => {
    expect(scaleOriginal("1 cup rice", 2)).toBe("2 cups rice")
    expect(scaleOriginal("2 cups flour, sifted", 0.5)).toBe("1 cup flour, sifted")
  })
  it("handles fractions", () => {
    expect(scaleOriginal("1/2 cup sugar", 3)).toBe("1½ cups sugar")
    expect(scaleOriginal("1 1/2 cups milk", 2)).toBe("3 cups milk")
    expect(scaleOriginal("½ tsp salt", 0.5)).toBe("¼ tsp salt")
  })
  it("scales counts without a unit", () => {
    expect(scaleOriginal("2 boneless chicken breasts, diced", 1.5)).toBe("3 boneless chicken breasts, diced")
    expect(scaleOriginal("3 eggs", 2)).toBe("6 eggs")
  })
  it("scales ranges", () => {
    expect(scaleOriginal("1-2 tbsp olive oil", 2)).toBe("2–4 tbsp olive oil")
  })
  it("leaves lines with no leading amount", () => {
    expect(scaleOriginal("salt to taste", 2)).toBe("salt to taste")
  })
})

describe("scaleCookLines", () => {
  const lines: CookLine[] = [
    { index: 0, original: "1 lb chicken", name: "chicken", kind: "deduct", itemId: "a", itemName: "chicken", itemUnit: "lb", have: 3, amount: 1 },
    { index: 1, original: "a pinch", name: "x", kind: "check", itemId: "b", itemName: "x", itemUnit: "g", have: 3, reason: "?" },
    { index: 2, original: "water", name: "water", kind: "basic" },
  ]
  it("scales deduct amounts only", () => {
    const out = scaleCookLines(lines, 1.5)
    expect(out[0]).toMatchObject({ kind: "deduct", amount: 1.5 })
    expect(out[1]).toEqual(lines[1])
    expect(out[2]).toEqual(lines[2])
  })
  it("is a no-op at 1x", () => {
    expect(scaleCookLines(lines, 1)).toEqual(lines)
  })
})
