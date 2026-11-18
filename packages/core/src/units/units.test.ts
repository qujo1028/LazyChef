import { describe, expect, it } from "vitest"

import {
  UNITS,
  UNIT_OPTIONS,
  canConvert,
  convertQuantity,
  formatQuantity,
  formatUnit,
  isUnit,
  normalizeUnit,
  unitDimension,
} from "."

const CANONICAL = [
  "g", "kg", "oz", "lb",
  "ml", "l", "tsp", "tbsp", "cup", "fl oz", "pt", "qt", "gal",
  "count",
  "can", "jar", "bottle", "bag", "box", "package", "bunch", "head", "clove", "slice", "stick", "loaf", "carton",
]

describe("normalizeUnit", () => {
  it.each([
    // mass
    ["lb", "lb"], ["lbs", "lb"], ["LBS", "lb"], ["pound", "lb"], ["Pounds", "lb"], ["#", "lb"], ["lbs.", "lb"],
    ["oz", "oz"], ["ounce", "oz"], ["ounces", "oz"], ["oz.", "oz"],
    ["g", "g"], ["gram", "g"], ["grams", "g"], ["gr", "g"], ["G", "g"],
    ["kg", "kg"], ["kilo", "kg"], ["kilos", "kg"], ["kilogram", "kg"], ["kilograms", "kg"],
    // volume
    ["ml", "ml"], ["mL", "ml"], ["milliliter", "ml"], ["milliliters", "ml"], ["millilitre", "ml"], ["millilitres", "ml"],
    ["l", "l"], ["L", "l"], ["liter", "l"], ["liters", "l"], ["litre", "l"], ["litres", "l"],
    ["tsp", "tsp"], ["teaspoon", "tsp"], ["teaspoons", "tsp"], ["t", "tsp"], ["t.", "tsp"],
    ["tbsp", "tbsp"], ["Tbsp", "tbsp"], ["TBSP", "tbsp"], ["tablespoon", "tbsp"], ["Tablespoons", "tbsp"],
    ["tbs", "tbsp"], ["tbl", "tbsp"], ["T", "tbsp"], ["T.", "tbsp"],
    ["cup", "cup"], ["cups", "cup"], ["c", "cup"], ["C", "cup"], ["c.", "cup"],
    ["fl oz", "fl oz"], ["fl. oz.", "fl oz"], ["fl.oz", "fl oz"], ["floz", "fl oz"], ["FL OZ", "fl oz"],
    ["fluid ounce", "fl oz"], ["fluid ounces", "fl oz"],
    ["pt", "pt"], ["pint", "pt"], ["pints", "pt"],
    ["qt", "qt"], ["quart", "qt"], ["quarts", "qt"],
    ["gal", "gal"], ["gallon", "gal"], ["gallons", "gal"],
    // count
    ["count", "count"], ["ea", "count"], ["each", "count"], ["pc", "count"], ["pcs", "count"],
    ["piece", "count"], ["pieces", "count"], ["ct", "count"],
    // packages
    ["can", "can"], ["cans", "can"], ["tin", "can"], ["tins", "can"],
    ["jar", "jar"], ["jars", "jar"], ["bottle", "bottle"], ["bottles", "bottle"],
    ["bag", "bag"], ["bags", "bag"], ["box", "box"], ["boxes", "box"],
    ["package", "package"], ["packages", "package"], ["pkg", "package"], ["pack", "package"], ["packs", "package"],
    ["packet", "package"], ["packets", "package"],
    ["bunch", "bunch"], ["bunches", "bunch"], ["head", "head"], ["heads", "head"],
    ["clove", "clove"], ["cloves", "clove"], ["slice", "slice"], ["slices", "slice"],
    ["stick", "stick"], ["sticks", "stick"], ["loaf", "loaf"], ["loaves", "loaf"],
    ["carton", "carton"], ["cartons", "carton"],
    // whitespace
    ["  lbs  ", "lb"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected)
  })

  it.each(["dozen", "doz", "", "  ", "banana", "cupcake", "x", "a", "whole", "large"])("%j → null", (input) => {
    expect(normalizeUnit(input)).toBeNull()
  })

  it("maps every canonical key to itself", () => {
    for (const unit of CANONICAL) expect(normalizeUnit(unit)).toBe(unit)
  })
})

describe("unit lists", () => {
  it("UNITS and UNIT_OPTIONS cover exactly the canonical keys", () => {
    expect([...UNITS].sort()).toEqual([...CANONICAL].sort())
    expect(UNIT_OPTIONS.map((o) => o.value)).toEqual(UNITS)
  })

  it("UNIT_OPTIONS is in picker order with short labels", () => {
    expect(UNIT_OPTIONS.map((o) => o.value)).toEqual([
      "count", "lb", "oz", "g", "kg",
      "gal", "qt", "pt", "cup", "fl oz", "l", "ml", "tbsp", "tsp",
      "can", "jar", "bottle", "bag", "box", "package", "bunch", "head", "clove", "slice", "stick", "loaf", "carton",
    ])
    expect(UNIT_OPTIONS[0]).toEqual({ value: "count", label: "each" })
    expect(UNIT_OPTIONS.find((o) => o.value === "l")?.label).toBe("L")
    for (const o of UNIT_OPTIONS) expect(o.label.length).toBeGreaterThan(0)
  })

  it("isUnit accepts canonical keys only", () => {
    expect(isUnit("fl oz")).toBe(true)
    expect(isUnit("count")).toBe(true)
    expect(isUnit("lbs")).toBe(false)
    expect(isUnit("dozen")).toBe(false)
  })
})

describe("unitDimension", () => {
  it.each([
    ["g", "mass"], ["kg", "mass"], ["oz", "mass"], ["lb", "mass"],
    ["ml", "volume"], ["l", "volume"], ["tsp", "volume"], ["tbsp", "volume"], ["cup", "volume"],
    ["fl oz", "volume"], ["pt", "volume"], ["qt", "volume"], ["gal", "volume"],
    ["count", "count"],
    ["can", "package"], ["loaf", "package"], ["carton", "package"], ["clove", "package"],
    ["lbs", "mass"], ["cups", "volume"], // aliases
    ["mystery", "count"], // unknown
  ])("%s → %s", (unit, dimension) => {
    expect(unitDimension(unit)).toBe(dimension)
  })
})

describe("convertQuantity", () => {
  it.each([
    // mass
    [1, "lb", "oz", 16],
    [2, "lb", "oz", 32],
    [8, "oz", "lb", 0.5],
    [1, "lb", "g", 453.59237],
    [1, "oz", "g", 28.349523125],
    [1, "kg", "g", 1000],
    [1, "kg", "lb", 2.20462],
    [500, "g", "kg", 0.5],
    // volume
    [1, "cup", "tbsp", 16],
    [1, "tbsp", "tsp", 3],
    [1, "cup", "ml", 236.588],
    [1, "tbsp", "ml", 14.7868],
    [1, "tsp", "ml", 4.92892],
    [1, "fl oz", "ml", 29.5735],
    [1, "pt", "ml", 473.176],
    [1, "qt", "ml", 946.353],
    [1, "gal", "ml", 3785.4118],
    [1, "l", "ml", 1000],
    [1, "gal", "qt", 4],
    [1, "qt", "pt", 2],
    [1, "pt", "cup", 2],
    [1, "cup", "fl oz", 8],
    [0.5, "gal", "cup", 8],
    [1, "l", "cup", 4.22675],
    // same unit and aliases
    [3, "can", "can", 3],
    [12, "count", "count", 12],
    [2, "lbs", "ounces", 32],
    [2, "Tablespoons", "tsp", 6],
  ] as const)("%d %s → %s = %d", (quantity, from, to, expected) => {
    const result = convertQuantity(quantity, from, to)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(expected, 3)
  })

  it.each([
    [1, "count", "lb"],
    [1, "lb", "count"],
    [1, "lb", "cup"], // mass ↔ volume needs a density
    [1, "cup", "g"],
    [1, "can", "jar"],
    [1, "can", "oz"],
    [1, "oz", "can"],
    [1, "count", "can"],
    [1, "lb", "mystery"],
    [Number.NaN, "lb", "oz"],
  ] as const)("%d %s → %s is impossible", (quantity, from, to) => {
    expect(convertQuantity(quantity, from, to)).toBeNull()
  })

  it("does not round", () => {
    expect(convertQuantity(1, "oz", "g")).toBe(28.349523125)
    expect(convertQuantity(1, "g", "oz")).toBeCloseTo(0.035274, 6)
  })

  it("round-trips", () => {
    const g = convertQuantity(2.5, "lb", "g")!
    expect(convertQuantity(g, "g", "lb")).toBeCloseTo(2.5, 10)
  })

  it("canConvert", () => {
    expect(canConvert("lb", "g")).toBe(true)
    expect(canConvert("cup", "ml")).toBe(true)
    expect(canConvert("can", "can")).toBe(true)
    expect(canConvert("count", "lb")).toBe(false)
    expect(canConvert("can", "bag")).toBe(false)
  })
})

describe("formatQuantity", () => {
  it.each([
    // null → UI shows its own label
    [null, "lb", ""],
    [null, "count", ""],
    // count: just the number
    [12, "count", "12"],
    [1, "count", "1"],
    [0.5, "count", "½"],
    // US units: fractions
    [1.5, "cup", "1½ cups"],
    [0.75, "lb", "¾ lb"],
    [0.5, "cup", "½ cup"],
    [0.25, "tsp", "¼ tsp"],
    [1 / 3, "cup", "⅓ cup"],
    [2 / 3, "cup", "⅔ cup"],
    [0.125, "tsp", "⅛ tsp"],
    [2.33, "cup", "2⅓ cups"],
    [1.26, "gal", "1¼ gal"],
    [0.5, "fl oz", "½ fl oz"],
    [0.5, "gal", "½ gal"],
    [1.49, "qt", "1½ qt"],
    // not close to a fraction → decimals
    [0.3, "cup", "0.3 cup"],
    [1.1, "lb", "1.1 lb"],
    [0.45, "lb", "0.45 lb"],
    [1.437, "lb", "1.44 lb"],
    // snaps to whole numbers
    [1.99, "cup", "2 cups"],
    [32.00003, "oz", "32 oz"],
    [2, "lb", "2 lb"],
    [8, "oz", "8 oz"],
    [2, "tbsp", "2 tbsp"],
    [16, "fl oz", "16 fl oz"],
    // plurals
    [1, "cup", "1 cup"],
    [2, "cup", "2 cups"],
    [3, "can", "3 cans"],
    [1, "can", "1 can"],
    [2, "loaf", "2 loaves"],
    [1, "loaf", "1 loaf"],
    [1, "bunch", "1 bunch"],
    [2, "bunch", "2 bunches"],
    [2, "box", "2 boxes"],
    [4, "clove", "4 cloves"],
    [1.5, "can", "1½ cans"],
    [0.5, "package", "½ package"],
    [0, "cup", "0 cups"],
    // metric: decimals
    [1.5, "kg", "1.5 kg"],
    [250, "g", "250 g"],
    [0.5, "kg", "0.5 kg"],
    [1.5, "l", "1.5 L"],
    [2.25, "l", "2.25 L"],
    [1.004, "kg", "1 kg"],
    [236.5882365, "ml", "236.59 ml"],
    [1000, "g", "1000 g"],
    // aliases and small numbers
    [2, "lbs", "2 lb"],
    [3, "cans", "3 cans"],
    [0.01, "lb", "0.01 lb"],
    [0.001, "cup", "0 cups"],
    [-2, "cup", "-2 cups"],
    // unknown units are shown as given
    [2, "sprig", "2 sprig"],
  ] as const)("%s %s → %j", (quantity, unit, expected) => {
    expect(formatQuantity(quantity, unit)).toBe(expected)
  })
})

describe("formatUnit", () => {
  it.each([
    ["cup", 1, "cup"],
    ["cup", 2, "cups"],
    ["cup", 0.5, "cup"],
    ["lb", 2, "lb"],
    ["loaf", 3, "loaves"],
    ["l", 2, "L"],
    ["count", 5, ""],
    ["cans", 2, "cans"],
    ["sprig", 2, "sprig"],
  ] as const)("%s ×%d → %j", (unit, quantity, expected) => {
    expect(formatUnit(unit, quantity)).toBe(expected)
  })

  it("defaults to singular", () => {
    expect(formatUnit("bunch")).toBe("bunch")
  })
})
