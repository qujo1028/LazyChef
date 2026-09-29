import { describe, expect, it } from "vitest"

import { isUnit } from "@/lib/units"

import { parseLine, parseLines } from "./parse-line"
import type { ParsedLine } from "./types"

/** [input, quantity, unit, name] */
type Row = [input: string, quantity: number | null, unit: string, name: string]

/** Every input from the tables below, for the invariant checks at the end. */
const ALL_INPUTS: string[] = []

function rows(list: Row[]): Row[] {
  ALL_INPUTS.push(...list.map(([input]) => input))
  return list
}

function mustParse(input: string): ParsedLine {
  const parsed = parseLine(input)
  if (!parsed) throw new Error(`parseLine(${JSON.stringify(input)}) returned null`)
  return parsed
}

function expectParsed(input: string, quantity: number | null, unit: string, name: string): ParsedLine {
  const parsed = mustParse(input)
  expect({ unit: parsed.unit, name: parsed.name }).toEqual({ unit, name })
  if (quantity === null) expect(parsed.quantity).toBeNull()
  else expect(parsed.quantity).toBeCloseTo(quantity, 9)
  return parsed
}

/** expectParsed for it.each, which wants a void callback. */
function check(input: string, quantity: number | null, unit: string, name: string): void {
  expectParsed(input, quantity, unit, name)
}

/** Shorthand for invisible or look-alike characters, so they're visible in this file. */
const NBSP = String.fromCharCode(0xa0)
const THIN_SPACE = String.fromCharCode(0x2009)
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)
const BOM = String.fromCharCode(0xfeff)
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)

describe("parseLine: numbers", () => {
  it.each(
    rows([
      ["2 eggs", 2, "count", "eggs"],
      ["12 eggs", 12, "count", "eggs"],
      ["0 eggs", 0, "count", "eggs"],
      // decimals
      ["1.5lbs ground beef", 1.5, "lb", "ground beef"],
      ["1.5 lbs ground beef", 1.5, "lb", "ground beef"],
      [".5 lb butter", 0.5, "lb", "butter"],
      ["0.25 cup sugar", 0.25, "cup", "sugar"],
      ["1,5 kg potatoes", 1.5, "kg", "potatoes"],
      ["1,000 g flour", 1000, "g", "flour"],
      // fractions
      ["1/2 cup sugar", 0.5, "cup", "sugar"],
      ["1/2 cup", 0.5, "cup", ""],
      ["3/4 cup milk", 0.75, "cup", "milk"],
      ["1 / 2 cup milk", 0.5, "cup", "milk"],
      ["1⁄2 cup milk", 0.5, "cup", "milk"],
      // mixed numbers
      ["1 1/2 cups flour", 1.5, "cup", "flour"],
      ["1-1/2 cups flour", 1.5, "cup", "flour"],
      ["2 3/4 cups flour", 2.75, "cup", "flour"],
      ["1 and 1/2 cups flour", 1.5, "cup", "flour"],
      // unicode fractions
      ["½ gal milk", 0.5, "gal", "milk"],
      ["1½ cups milk", 1.5, "cup", "milk"],
      ["1 ½ cups milk", 1.5, "cup", "milk"],
      ["¼ tsp salt", 0.25, "tsp", "salt"],
      ["¾ cup oats", 0.75, "cup", "oats"],
      ["⅓ cup honey", 1 / 3, "cup", "honey"],
      ["1⅔ cups oats", 5 / 3, "cup", "oats"],
      ["⅛ tsp cayenne", 0.125, "tsp", "cayenne"],
      // no space before the unit
      ["500g rice", 500, "g", "rice"],
      ["2kg potatoes", 2, "kg", "potatoes"],
      ["250ml cream", 250, "ml", "cream"],
      ["16oz pasta", 16, "oz", "pasta"],
      ["2lbs chicken", 2, "lb", "chicken"],
      ["1½cups milk", 1.5, "cup", "milk"],
      // ranges take the first number
      ["2-3 apples", 2, "count", "apples"],
      ["2 - 3 apples", 2, "count", "apples"],
      ["2–3 apples", 2, "count", "apples"],
      ["2 to 3 apples", 2, "count", "apples"],
      ["2 or 3 apples", 2, "count", "apples"],
      ["1-2 lbs ground beef", 1, "lb", "ground beef"],
      ["1.5-2 lbs chicken", 1.5, "lb", "chicken"],
      ["two or three apples", 2, "count", "apples"],
      // approximate amounts
      ["about 2 lbs chicken", 2, "lb", "chicken"],
      ["~2 lbs chicken", 2, "lb", "chicken"],
      ["approx. 500g beef", 500, "g", "beef"],
      ["around 3 apples", 3, "count", "apples"],
      // multiplied amounts
      ["2 x 400g pasta", 800, "g", "pasta"],
      ["2x eggs", 2, "count", "eggs"],
      ["3 x eggs", 3, "count", "eggs"],
      // compound measures
      ["1 lb 8 oz beef", 1.5, "lb", "beef"],
      ["1 cup 2 tbsp butter", 1.125, "cup", "butter"],
    ]),
  )("%j → %s %s %j", check)
})

describe("parseLine: number words", () => {
  const WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]
  it.each(rows(WORDS.map((word, i): Row => [`${word} eggs`, i + 1, "count", "eggs"])))(
    "%j → %s %s %j",
    check,
  )

  it.each(
    rows([
      ["a banana", 1, "count", "banana"],
      ["an apple", 1, "count", "apple"],
      ["A Banana", 1, "count", "banana"],
      ["Three Limes", 3, "count", "limes"],
      ["a couple of onions", 2, "count", "onions"],
      ["a couple onions", 2, "count", "onions"],
      ["couple of limes", 2, "count", "limes"],
      ["a pair of avocados", 2, "count", "avocados"],
      ["a few apples", 3, "count", "apples"],
      ["half an onion", 0.5, "count", "onion"],
      ["a half gallon of milk", 0.5, "gal", "milk"],
      ["half a gallon of milk", 0.5, "gal", "milk"],
      ["half gallon milk", 0.5, "gal", "milk"],
      ["half gal milk", 0.5, "gal", "milk"],
      ["1/2 gallon milk", 0.5, "gal", "milk"],
      ["a quarter pound of beef", 0.25, "lb", "beef"],
      ["one and a half cups flour", 1.5, "cup", "flour"],
      ["two and a half pounds beef", 2.5, "lb", "beef"],
      ["a pound of beef", 1, "lb", "beef"],
      ["a loaf of bread", 1, "loaf", "bread"],
      // dozens
      ["a dozen eggs", 12, "count", "eggs"],
      ["dozen eggs", 12, "count", "eggs"],
      ["1 dozen eggs", 12, "count", "eggs"],
      ["one dozen eggs", 12, "count", "eggs"],
      ["2 dozen eggs", 24, "count", "eggs"],
      ["2 doz eggs", 24, "count", "eggs"],
      ["half a dozen eggs", 6, "count", "eggs"],
      ["half dozen eggs", 6, "count", "eggs"],
      ["1 1/2 dozen eggs", 18, "count", "eggs"],
    ]),
  )("%j → %s %s %j", check)
})

describe("parseLine: units", () => {
  it.each(
    rows([
      ["100 g flour", 100, "g", "flour"],
      ["2 grams saffron", 2, "g", "saffron"],
      ["2 kg flour", 2, "kg", "flour"],
      ["8 oz cheese", 8, "oz", "cheese"],
      ["8 oz. cheese", 8, "oz", "cheese"],
      ["8 ounces cheese", 8, "oz", "cheese"],
      ["2 lb beef", 2, "lb", "beef"],
      ["2 LBS beef", 2, "lb", "beef"],
      ["2 lbs. chicken", 2, "lb", "chicken"],
      ["2 pounds chicken", 2, "lb", "chicken"],
      ["2# chicken", 2, "lb", "chicken"],
      ["250 ml cream", 250, "ml", "cream"],
      ["250 mL cream", 250, "ml", "cream"],
      ["1 l milk", 1, "l", "milk"],
      ["1 L milk", 1, "l", "milk"],
      ["1 liter milk", 1, "l", "milk"],
      ["2 tsp salt", 2, "tsp", "salt"],
      ["2 t salt", 2, "tsp", "salt"],
      ["3 TSP salt", 3, "tsp", "salt"],
      ["1 tbsp butter", 1, "tbsp", "butter"],
      ["1 Tbsp. butter", 1, "tbsp", "butter"],
      ["1 T butter", 1, "tbsp", "butter"],
      ["2 tablespoons butter", 2, "tbsp", "butter"],
      ["2 cups rice", 2, "cup", "rice"],
      ["2 c flour", 2, "cup", "flour"],
      ["1 c. flour", 1, "cup", "flour"],
      ["8 fl oz cream", 8, "fl oz", "cream"],
      ["8 fl. oz. cream", 8, "fl oz", "cream"],
      ["8 fluid ounces cream", 8, "fl oz", "cream"],
      ["8floz cream", 8, "fl oz", "cream"],
      ["1 pint strawberries", 1, "pt", "strawberries"],
      ["1 pt strawberries", 1, "pt", "strawberries"],
      ["1 qt stock", 1, "qt", "stock"],
      ["1 quart stock", 1, "qt", "stock"],
      ["1 gallon milk", 1, "gal", "milk"],
      ["1 gal milk", 1, "gal", "milk"],
      ["12 ct eggs", 12, "count", "eggs"],
      ["12ct eggs", 12, "count", "eggs"],
      ["4 pcs chicken", 4, "count", "chicken"],
      ["2 each avocado", 2, "count", "avocado"],
      ["2 cans beans", 2, "can", "beans"],
      ["1 tin tomatoes", 1, "can", "tomatoes"],
      ["1 jar salsa", 1, "jar", "salsa"],
      ["2 bottles wine", 2, "bottle", "wine"],
      ["1 bag spinach", 1, "bag", "spinach"],
      ["2 boxes pasta", 2, "box", "pasta"],
      ["1 pkg cream cheese", 1, "package", "cream cheese"],
      ["2 packets yeast", 2, "package", "yeast"],
      ["1 pack gum", 1, "package", "gum"],
      ["1 bunch cilantro", 1, "bunch", "cilantro"],
      ["1 head lettuce", 1, "head", "lettuce"],
      ["3 cloves garlic", 3, "clove", "garlic"],
      ["4 slices bread", 4, "slice", "bread"],
      ["2 sticks butter", 2, "stick", "butter"],
      ["2 loaves bread", 2, "loaf", "bread"],
      ["1 carton eggs", 1, "carton", "eggs"],
      // multipacks are counts
      ["12-pack soda", 12, "count", "soda"],
      ["6 pack beer", 6, "count", "beer"],
      // a unit word glued to more letters is part of the name
      ["2 cupcakes", 2, "count", "cupcakes"],
      ["2 T-bone steaks", 2, "count", "t-bone steaks"],
      ["3 large eggs", 3, "count", "large eggs"],
    ]),
  )("%j → %s %s %j", check)
})

describe("parseLine: package sizes", () => {
  it.each(
    rows([
      ["1 (14 oz) can diced tomatoes", 1, "can", "diced tomatoes"],
      ["1 (14.5 oz) can tomatoes", 1, "can", "tomatoes"],
      ["2 (15 oz) cans black beans", 2, "can", "black beans"],
      ["2 15-oz cans black beans", 2, "can", "black beans"],
      ["1 14 oz can coconut milk", 1, "can", "coconut milk"],
      ["14 oz can tomatoes", 1, "can", "tomatoes"],
      ["5 lb bag of potatoes", 1, "bag", "potatoes"],
      ["a 2 lb bag of rice", 1, "bag", "rice"],
      ["2 cans (15 oz) black beans", 2, "can", "black beans"],
      ["2 cans of black beans", 2, "can", "black beans"],
      ["2 x 400g cans tomatoes", 2, "can", "tomatoes"],
      // no package unit: the size is the amount
      ["2 (15 oz) black beans", 30, "oz", "black beans"],
      ["2 (15 oz each) black beans", 30, "oz", "black beans"],
      // a unit word with no number means one of it
      ["bag of spinach", 1, "bag", "spinach"],
      ["a bag of spinach", 1, "bag", "spinach"],
      ["can of tuna", 1, "can", "tuna"],
      ["box of pasta", 1, "box", "pasta"],
      ["jar of salsa", 1, "jar", "salsa"],
      ["bunch of kale", 1, "bunch", "kale"],
      ["head of garlic", 1, "head", "garlic"],
      ["loaf of bread", 1, "loaf", "bread"],
      ["stick of butter", 1, "stick", "butter"],
      ["gallon milk", 1, "gal", "milk"],
      ["gallon of milk", 1, "gal", "milk"],
      ["head lettuce", 1, "head", "lettuce"],
      ["cup of rice", 1, "cup", "rice"],
      ["pound of beef", 1, "lb", "beef"],
      // …but some unit words start names
      ["cup noodles", null, "count", "cup noodles"],
      ["pound cake", null, "count", "pound cake"],
      ["cloves", null, "count", "cloves"],
    ]),
  )("%j → %s %s %j", check)
})

describe("parseLine: amounts after the name", () => {
  it.each(
    rows([
      ["eggs x12", 12, "count", "eggs"],
      ["eggs x 12", 12, "count", "eggs"],
      ["eggs ×12", 12, "count", "eggs"],
      ["eggs 12", 12, "count", "eggs"],
      ["eggs (12)", 12, "count", "eggs"],
      ["eggs, 12", 12, "count", "eggs"],
      ["eggs 12ct", 12, "count", "eggs"],
      ["milk - 1 gal", 1, "gal", "milk"],
      ["milk: 1 gal", 1, "gal", "milk"],
      ["milk 1gal", 1, "gal", "milk"],
      ["milk 1 gallon", 1, "gal", "milk"],
      ["chicken breast 2 lbs", 2, "lb", "chicken breast"],
      ["chicken breast, 2 lbs", 2, "lb", "chicken breast"],
      ["chicken 2.5 lbs", 2.5, "lb", "chicken"],
      ["chicken 2 1/2 lbs", 2.5, "lb", "chicken"],
      ["chicken (about 2 lbs)", 2, "lb", "chicken"],
      ["beef 1 lb 8 oz", 1.5, "lb", "beef"],
      ["bread (2 loaves)", 2, "loaf", "bread"],
      ["tomatoes 2 cans", 2, "can", "tomatoes"],
      ["tomatoes 14.5 oz can", 1, "can", "tomatoes"],
      ["flour 5 lb bag", 1, "bag", "flour"],
      ["beer 12-pack", 12, "count", "beer"],
      ["beer 12 pack", 12, "count", "beer"],
      ["coke 2 liter", 2, "l", "coke"],
      ["coke 2-liter", 2, "l", "coke"],
      ["coke 2l", 2, "l", "coke"],
      ["eggs dozen", 12, "count", "eggs"],
      ["eggs 1 dozen", 12, "count", "eggs"],
      ["eggs 2 dozen", 24, "count", "eggs"],
      ["eggs a dozen", 12, "count", "eggs"],
      ["eggs two dozen", 24, "count", "eggs"],
      ["milk half gallon", 0.5, "gal", "milk"],
      ["milk 1/2 gal", 0.5, "gal", "milk"],
      ["2% milk 1 gal", 1, "gal", "2% milk"],
      ["7up 2 liter", 2, "l", "7up"],
      ["half and half 1 qt", 1, "qt", "half and half"],
      ["salt & pepper 2", 2, "count", "salt & pepper"],
      ["mac and cheese 2 boxes", 2, "box", "mac and cheese"],
      // a few unit words alone after a name, as receipts write them
      ["milk gal", 1, "gal", "milk"],
      ["ice cream pint", 1, "pt", "ice cream"],
      ["romaine lettuce head", 1, "head", "romaine lettuce"],
      ["cilantro bunch", 1, "bunch", "cilantro"],
      // not amounts
      ["tea for two", null, "count", "tea for two"],
      ["apple a", null, "count", "apple a"],
      ["vitamin c", null, "count", "vitamin c"],
      ["milk 2%", null, "count", "milk 2%"],
      ["fish sticks", null, "count", "fish sticks"],
      ["meat loaf", null, "count", "meat loaf"],
      ["half-and-half", null, "count", "half-and-half"],
    ]),
  )("%j → %s %s %j", (input, quantity, unit, name) => {
    expect(expectParsed(input, quantity, unit, name).amountText).toBe("")
  })
})

describe("parseLine: no amount", () => {
  it.each(
    rows([
      ["salt", null, "count", "salt"],
      ["Salt", null, "count", "salt"],
      ["black pepper", null, "count", "black pepper"],
      ["some salt", null, "count", "salt"],
      ["a pinch of salt", null, "count", "salt"],
      ["a dash of hot sauce", null, "count", "hot sauce"],
      ["a handful of spinach", null, "count", "spinach"],
      ["lots of garlic", null, "count", "garlic"],
      ["a lot of cheese", null, "count", "cheese"],
      ["a little bit of milk", null, "count", "milk"],
    ]),
  )("%j → %s %s %j", check)
})

describe("parseLine: list markers", () => {
  it.each(
    rows([
      ["- eggs", null, "count", "eggs"],
      ["-- eggs", null, "count", "eggs"],
      ["• eggs", null, "count", "eggs"],
      ["* eggs", null, "count", "eggs"],
      ["+ eggs", null, "count", "eggs"],
      ["1. eggs", null, "count", "eggs"],
      ["2) eggs", null, "count", "eggs"],
      ["10. eggs", null, "count", "eggs"],
      ["(3) eggs", null, "count", "eggs"],
      ["[ ] eggs", null, "count", "eggs"],
      ["[x] eggs", null, "count", "eggs"],
      ["☐ eggs", null, "count", "eggs"],
      ["- 2 lbs chicken", 2, "lb", "chicken"],
      ["• 2 lbs chicken", 2, "lb", "chicken"],
      ["1. 2 lbs chicken", 2, "lb", "chicken"],
      ["2) 1 dozen eggs", 12, "count", "eggs"],
      ["* 1/2 cup sugar", 0.5, "cup", "sugar"],
      ["- eggs x12", 12, "count", "eggs"],
      // amounts, not markers
      ["1 egg", 1, "count", "egg"],
      ["12 eggs", 12, "count", "eggs"],
      ["1.5 cups milk", 1.5, "cup", "milk"],
    ]),
  )("%j → %s %s %j", check)

  it("takes the marker out of raw and amountText", () => {
    expect(parseLine("- 2 lbs chicken")).toEqual({
      raw: "2 lbs chicken",
      amountText: "2 lbs ",
      name: "chicken",
      quantity: 2,
      unit: "lb",
    })
    expect(parseLine("1. eggs")).toEqual({ raw: "eggs", amountText: "", name: "eggs", quantity: null, unit: "count" })
  })
})

describe("parseLine: names", () => {
  it.each(
    rows([
      // lowercase, trimmed, single spaces, no trailing punctuation
      ["  Chicken   Breast  ", null, "count", "chicken breast"],
      ["2 lbs   Chicken\tBreast", 2, "lb", "chicken breast"],
      ["Eggs!", null, "count", "eggs"],
      ["milk.", null, "count", "milk"],
      ["bread...", null, "count", "bread"],
      ["2 lbs chicken breast,", 2, "lb", "chicken breast"],
      ["eggs -", null, "count", "eggs"],
      ["eggs (", null, "count", "eggs"],
      ["2 lbs - chicken", 2, "lb", "chicken"],
      ["2 lbs: chicken", 2, "lb", "chicken"],
      // descriptors are kept
      ["2 large eggs", 2, "count", "large eggs"],
      ["1 lb boneless skinless chicken thighs", 1, "lb", "boneless skinless chicken thighs"],
      ["3 ripe bananas", 3, "count", "ripe bananas"],
      ["eggs (large)", null, "count", "eggs (large)"],
      // a leading "of" goes
      ["of milk", null, "count", "milk"],
      ["2 cups of flour", 2, "cup", "flour"],
      ["2 lbs  of  chicken", 2, "lb", "chicken"],
      ["2 lb offal", 2, "lb", "offal"],
      // numeric-looking names survive
      ["7up", null, "count", "7up"],
      ["2% milk", null, "count", "2% milk"],
      ["100% orange juice", null, "count", "100% orange juice"],
      ["5-spice powder", null, "count", "5-spice powder"],
      ["t-bone steak", null, "count", "t-bone steak"],
      ["v8 juice", null, "count", "v8 juice"],
      ["V8 Juice", null, "count", "v8 juice"],
      ["a1 sauce", null, "count", "a1 sauce"],
      ["2 7up", 2, "count", "7up"],
      ["3 v8 juice", 3, "count", "v8 juice"],
      ["1 gal 2% milk", 1, "gal", "2% milk"],
      ["1 gallon of 2% milk", 1, "gal", "2% milk"],
      ["1 cup 2% milk", 1, "cup", "2% milk"],
      ["1 jar 5-spice powder", 1, "jar", "5-spice powder"],
      ["1 5-spice powder", 1, "count", "5-spice powder"],
      // words that look like amounts
      ["half and half", null, "count", "half and half"],
      ["half & half", null, "count", "half & half"],
      ["half n half", null, "count", "half n half"],
      ["a&w root beer", null, "count", "a&w root beer"],
      ["a and w root beer", null, "count", "a and w root beer"],
      ["salt and pepper", null, "count", "salt and pepper"],
      ["3 mac and cheese", 3, "count", "mac and cheese"],
      ["2 half and half", 2, "count", "half and half"],
      // non-ASCII
      ["2 Jalapeños", 2, "count", "jalapeños"],
      ["Crème Fraîche", null, "count", "crème fraîche"],
      ["ben & jerry's", null, "count", "ben & jerry's"],
    ]),
  )("%j → %s %s %j", check)
})

describe("parseLine: amountText", () => {
  it.each([
    ["2 lbs chicken breast", "2 lbs "],
    ["1 dozen eggs", "1 dozen "],
    ["½ gal milk", "½ gal "],
    ["500g rice", "500g "],
    ["1 1/2 cups flour", "1 1/2 cups "],
    ["1 (14 oz) can diced tomatoes", "1 (14 oz) can "],
    ["2 cans of black beans", "2 cans of "],
    ["a couple of onions", "a couple of "],
    ["half a dozen eggs", "half a dozen "],
    ["about 2 lbs chicken", "about 2 lbs "],
    ["2 x 400g pasta", "2 x 400g "],
    ["1 lb 8 oz beef", "1 lb 8 oz "],
    ["bag of spinach", "bag of "],
    ["some salt", "some "],
    ["2 lbs - chicken", "2 lbs - "],
    ["2 LBS Chicken", "2 LBS "],
    ["2 lbs", "2 lbs"],
    ["2", "2"],
    ["salt", ""],
    ["eggs x12", ""],
    ["chicken breast 2 lbs", ""],
  ])("%j → %j", (input, amountText) => {
    const parsed = mustParse(input)
    expect(parsed.amountText).toBe(amountText)
    expect(parsed.raw.startsWith(parsed.amountText)).toBe(true)
  })

  it.each([
    "2 lbs chicken breast",
    "1 dozen eggs",
    "½ gal milk",
    "1½ cups milk",
    "500g rice",
    "1 1/2 cups flour",
    "1 (14 oz) can diced tomatoes",
    "2 cans of black beans",
    "a couple of onions",
    "half a dozen eggs",
    "2 x 400g pasta",
    "1 lb 8 oz beef",
    "3 cloves garlic",
    "a banana",
  ])("amountText + name rebuilds %j", (input) => {
    const parsed = mustParse(input)
    expect(parsed.amountText.endsWith(" ")).toBe(true)
    expect(parsed.amountText + parsed.name).toBe(input)
  })
})

describe("parseLine: partial input while typing", () => {
  it.each(
    rows([
      ["2", 2, "count", ""],
      ["2 ", 2, "count", ""],
      ["2 l", 2, "l", ""],
      ["2 lb", 2, "lb", ""],
      ["2 lbs", 2, "lb", ""],
      ["2 lbs ", 2, "lb", ""],
      ["2 lbs c", 2, "lb", "c"],
      ["2 lbs chi", 2, "lb", "chi"],
      ["2-", 2, "count", ""],
      ["1/", 1, "count", ""],
      ["1 1/", 1, "count", ""],
      ["1 1/2", 1.5, "count", ""],
      ["1.", 1, "count", ""],
      ["3x", 3, "count", ""],
      ["½", 0.5, "count", ""],
      // a lone "a"/"one" may be the start of "apple"/"onion"…
      ["a", null, "count", "a"],
      ["an", null, "count", "an"],
      ["one", null, "count", "one"],
      ["half", null, "count", "half"],
      // …but a phrase is an amount
      ["a couple", 2, "count", ""],
      ["a couple of", 2, "count", ""],
      ["half a", 0.5, "count", ""],
      ["one and a half", 1.5, "count", ""],
      ["half and", null, "count", "half and"],
    ]),
  )("%j → %s %s %j", check)

  it.each([
    "2 lbs chicken breast",
    "1 1/2 cups flour",
    "2 cans of black beans",
    "half a dozen eggs",
    "1 (14 oz) can diced tomatoes",
    "a couple of onions",
    "½ gal milk",
    "chicken breast 2 lbs",
    "eggs x12",
    "- 1. [ ] 2 lbs chicken $7.98",
    "half and half 1 qt",
  ])("every prefix of %j parses", (full) => {
    for (let i = 1; i <= full.length; i++) {
      const prefix = full.slice(0, i)
      const parsed = parseLine(prefix)
      if (!prefix.trim()) continue
      if (!parsed) continue // only a list marker so far
      expect(parsed.raw.startsWith(parsed.amountText), prefix).toBe(true)
      if (parsed.quantity !== null) expect(Number.isFinite(parsed.quantity), prefix).toBe(true)
      expect(isUnit(parsed.unit), prefix).toBe(true)
    }
  })

  it("keeps the amount steady while the name is typed", () => {
    const full = "2 lbs chicken breast"
    for (let i = "2 lbs c".length; i <= full.length; i++) {
      const parsed = mustParse(full.slice(0, i))
      expect(parsed).toMatchObject({ amountText: "2 lbs ", quantity: 2, unit: "lb" })
      expect(parsed.name).toBe(full.slice(6, i).trimEnd())
    }
  })
})

describe("parseLine: prices", () => {
  it.each(
    rows([
      ["milk $3.49", null, "count", "milk"],
      ["milk - $3.49", null, "count", "milk"],
      ["milk @ $3.49", null, "count", "milk"],
      ["milk $ 3.49", null, "count", "milk"],
      ["milk $3", null, "count", "milk"],
      ["milk €3,49", null, "count", "milk"],
      ["milk 3,49 €", null, "count", "milk"],
      ["milk 3.49$", null, "count", "milk"],
      ["milk £2", null, "count", "milk"],
      ["milk 3.49", null, "count", "milk"],
      ["BREAD 2.49 F", null, "count", "bread"],
      ["bananas 1.99/lb", null, "count", "bananas"],
      ["bananas @ 0.59/lb", null, "count", "bananas"],
      ["milk 1 gal $3.49", 1, "gal", "milk"],
      ["2 lbs chicken $7.98", 2, "lb", "chicken"],
      ["eggs x12 $4.29", 12, "count", "eggs"],
      ["yogurt x2 $5.00", 2, "count", "yogurt"],
      ["Avocado 3 @ $1.25 $3.75", 3, "count", "avocado"],
      ["CHKN BRST 2.13 lb @ $5.99/lb 12.76", 2.13, "lb", "chkn brst"],
      // amounts that look a bit like prices
      ["3.49", 3.49, "count", ""],
      ["2.25 lb chicken", 2.25, "lb", "chicken"],
      ["chicken 2.25 lb", 2.25, "lb", "chicken"],
      ["BEEF 1.25 LB", 1.25, "lb", "beef"],
      ["apples 2,3", 2.3, "count", "apples"],
    ]),
  )("%j → %s %s %j", check)

  it("takes the price out of raw", () => {
    expect(mustParse("milk $3.49").raw).toBe("milk")
    expect(mustParse("2 lbs chicken - $7.98").raw).toBe("2 lbs chicken")
  })
})

describe("parseLine: blank and junk input", () => {
  it.each(["", "   ", "\t", "-", "• ", "1) ", "[ ]", "$3.49", "- $3.49"])("%j → null", (input) => {
    expect(parseLine(input)).toBeNull()
  })

  it("never returns a non-finite or huge quantity", () => {
    expect(parseLine("1/0 cup")).toMatchObject({ quantity: null, name: "1/0 cup" })
    expect(parseLine("0/0 eggs")).toMatchObject({ quantity: null })
    expect(parseLine("99999999999999999999999 eggs")).toMatchObject({ quantity: null })
    expect(parseLine("012345678905 milk")).toMatchObject({ quantity: null, name: "012345678905 milk" })
    expect(parseLine("1e5 eggs")).toMatchObject({ quantity: null, name: "1e5 eggs" })
    expect(parseLine("999999 dozen eggs")).toMatchObject({ quantity: null })
  })
})

describe("parseLine: unusual spaces", () => {
  it("treats no-break and thin spaces as spaces", () => {
    expect(parseLine(`2${NBSP}lbs${NBSP}chicken`)).toEqual({
      raw: "2 lbs chicken",
      amountText: "2 lbs ",
      name: "chicken",
      quantity: 2,
      unit: "lb",
    })
    expectParsed(`1${THIN_SPACE}½ cups milk`, 1.5, "cup", "milk")
    expectParsed(`chicken${NBSP}2${NBSP}lbs`, 2, "lb", "chicken")
    expectParsed(`-${NBSP}eggs`, null, "count", "eggs")
    expectParsed(`milk${NBSP}$3.49`, null, "count", "milk")
  })

  it("ignores zero-width spaces and a byte order mark", () => {
    expectParsed(`${BOM}2 eggs`, 2, "count", "eggs")
    expectParsed(`2${ZERO_WIDTH_SPACE} eggs`, 2, "count", "eggs")
    expectParsed(`egg${ZERO_WIDTH_SPACE}s`, null, "count", "eggs")
  })
})

describe("parseLines", () => {
  const names = (text: string) => parseLines(text).map((line) => line.name)
  const summary = (text: string) => parseLines(text).map((line) => [line.name, line.quantity, line.unit])

  it("splits on newlines, semicolons, commas and inline bullets", () => {
    expect(names("eggs\nmilk\r\nbread\rbutter")).toEqual(["eggs", "milk", "bread", "butter"])
    expect(names(`eggs${LINE_SEPARATOR}milk${PARAGRAPH_SEPARATOR}bread`)).toEqual(["eggs", "milk", "bread"])
    expect(names("eggs; milk;bread")).toEqual(["eggs", "milk", "bread"])
    expect(names("eggs, milk,bread")).toEqual(["eggs", "milk", "bread"])
    expect(names("eggs • milk • bread")).toEqual(["eggs", "milk", "bread"])
    expect(names("eggs, milk, and bread")).toEqual(["eggs", "milk", "bread"])
    expect(names("eggs, milk & bread")).toEqual(["eggs", "milk & bread"])
  })

  it("keeps commas inside numbers and parentheses", () => {
    expect(summary("1,000 g flour, 2 eggs")).toEqual([
      ["flour", 1000, "g"],
      ["eggs", 2, "count"],
    ])
    expect(summary("1,5 kg potatoes, 2 onions")).toEqual([
      ["potatoes", 1.5, "kg"],
      ["onions", 2, "count"],
    ])
    expect(names("cheese (cheddar, sharp), crackers")).toEqual(["cheese (cheddar, sharp)", "crackers"])
    // an unclosed "(" doesn't swallow the rest of the line
    expect(names("eggs (large, milk, bread")).toEqual(["eggs (large", "milk", "bread"])
  })

  it("drops blanks", () => {
    expect(parseLines("")).toEqual([])
    expect(parseLines("\n\n  \n\t")).toEqual([])
    expect(parseLines(",,;, ;")).toEqual([])
    expect(names("eggs\n\n   \n- \nmilk\n")).toEqual(["eggs", "milk"])
  })

  it("parses each piece like parseLine", () => {
    expect(parseLines("2 lbs chicken breast; 1 dozen eggs\n- ½ gal milk\n1. salt")).toEqual([
      { raw: "2 lbs chicken breast", amountText: "2 lbs ", name: "chicken breast", quantity: 2, unit: "lb" },
      { raw: "1 dozen eggs", amountText: "1 dozen ", name: "eggs", quantity: 12, unit: "count" },
      { raw: "½ gal milk", amountText: "½ gal ", name: "milk", quantity: 0.5, unit: "gal" },
      { raw: "salt", amountText: "", name: "salt", quantity: null, unit: "count" },
    ])
  })

  it("joins an amount-only piece to the item before it", () => {
    expect(parseLines("chicken breast, 2 lbs")).toEqual([
      { raw: "chicken breast, 2 lbs", amountText: "", name: "chicken breast", quantity: 2, unit: "lb" },
    ])
    expect(summary("chicken breast\n2 lbs\nmilk")).toEqual([
      ["chicken breast", 2, "lb"],
      ["milk", null, "count"],
    ])
    // not when that item already has an amount
    expect(summary("2 eggs, 3")).toEqual([
      ["eggs", 2, "count"],
      ["", 3, "count"],
    ])
  })

  it("drops recipe notes after a comma", () => {
    expect(summary("2 cloves garlic, minced")).toEqual([["garlic", 2, "clove"]])
    expect(summary("salt, to taste")).toEqual([["salt", null, "count"]])
    expect(summary("1 onion, finely chopped; 1 (14 oz) can tomatoes, drained")).toEqual([
      ["onion", 1, "count"],
      ["tomatoes", 1, "can"],
    ])
    // a line that's only a note is still an item
    expect(names("minced")).toEqual(["minced"])
  })

  it("strips trailing prices", () => {
    expect(summary("milk $3.49\neggs x12 $4.29\nbread - $2.99\n2 lbs chicken @ $3.99/lb")).toEqual([
      ["milk", null, "count"],
      ["eggs", 12, "count"],
      ["bread", null, "count"],
      ["chicken", 2, "lb"],
    ])
  })

  it("reads a pasted 50-line receipt", () => {
    const receipt = [
      "ORGANIC BANANAS        1.99 F",
      "MILK 2% GAL            $3.49",
      "EGGS LG DOZ            4.29 F",
      "CHKN BRST 2.13 lb @ $5.99/lb   12.76",
      "YOGURT GREEK           1.98",
      "  2 @ 0.99",
      "BREAD WHEAT            2.49 F",
      "AVOCADO 3 @ $1.25      $3.75",
      "SPINACH 5 OZ BAG       3.99",
      "CHEDDAR 8 OZ           4.49",
      "BUTTER 1 LB            4.99",
      "OJ 52 FL OZ            3.79",
      "RICE 2 LB BAG          2.99",
      "BLACK BEANS 15 OZ CAN  0.99",
      "BLACK BEANS 15 OZ CAN  0.99",
      "PASTA 16 OZ            1.49",
      "TOMATOES 28 OZ CAN     2.29",
      "ONIONS 3 LB BAG        3.49",
      "GARLIC                 0.50",
      "APPLES 3LB BAG         4.99",
      "CARROTS 2 LB           1.99",
      "POTATOES 5 LB BAG      3.99",
      "CEREAL                 3.99",
      "COFFEE 12 OZ           7.99",
      "SUGAR 4 LB             2.79",
      "FLOUR 5 LB             3.29",
      "OLIVE OIL 500 ML       6.99",
      "KETCHUP 20 OZ          2.19",
      "PEANUT BUTTER 16 OZ    2.99",
      "STRAWBERRIES 1 LB      3.99",
      "LEMONS 2 @ 0.69        1.38",
      "CUCUMBER               0.79",
      "HALF & HALF QT         2.49",
      "SALSA 16 OZ JAR        3.29",
      "TORTILLAS 10 CT        2.99",
      "CREAM CHEESE 8 OZ      1.99",
      "BROCCOLI 1.2 lb @ $1.99/lb   2.39",
      "GROUND BEEF 1 LB       5.99",
      "BACON 12 OZ            4.99",
      "PARMESAN 5 OZ          4.29",
      "LETTUCE HEAD           1.49",
      "CILANTRO BUNCH         0.99",
      "CELERY                 1.79",
      "WATER 24 PK            3.99",
      "HONEY 12 OZ            5.49",
      "SUBTOTAL               177.84",
      "TAX                    1.23",
      "TOTAL                  179.07",
      "VISA ****1234          179.07",
      "CHANGE DUE             0.00",
    ].join("\n")
    expect(receipt.split("\n")).toHaveLength(50)

    expect(summary(receipt)).toEqual([
      ["organic bananas", null, "count"],
      ["milk 2%", 1, "gal"],
      ["eggs lg", 12, "count"],
      ["chkn brst", 2.13, "lb"],
      ["yogurt greek", 2, "count"],
      ["bread wheat", null, "count"],
      ["avocado", 3, "count"],
      ["spinach", 1, "bag"],
      ["cheddar", 8, "oz"],
      ["butter", 1, "lb"],
      ["oj", 52, "fl oz"],
      ["rice", 1, "bag"],
      ["black beans", 1, "can"],
      ["black beans", 1, "can"],
      ["pasta", 16, "oz"],
      ["tomatoes", 1, "can"],
      ["onions", 1, "bag"],
      ["garlic", null, "count"],
      ["apples", 1, "bag"],
      ["carrots", 2, "lb"],
      ["potatoes", 1, "bag"],
      ["cereal", null, "count"],
      ["coffee", 12, "oz"],
      ["sugar", 4, "lb"],
      ["flour", 5, "lb"],
      ["olive oil", 500, "ml"],
      ["ketchup", 20, "oz"],
      ["peanut butter", 16, "oz"],
      ["strawberries", 1, "lb"],
      ["lemons", 2, "count"],
      ["cucumber", null, "count"],
      ["half & half", 1, "qt"],
      ["salsa", 1, "jar"],
      ["tortillas", 10, "count"],
      ["cream cheese", 8, "oz"],
      ["broccoli", 1.2, "lb"],
      ["ground beef", 1, "lb"],
      ["bacon", 12, "oz"],
      ["parmesan", 5, "oz"],
      ["lettuce", 1, "head"],
      ["cilantro", 1, "bunch"],
      ["celery", null, "count"],
      ["water", 24, "count"],
      ["honey", 12, "oz"],
    ])
  })

  it("only drops receipt totals that have a price", () => {
    expect(names("total cereal 3.99\ntotal\nTAX 1.23")).toEqual(["total cereal", "total"])
  })
})

describe("performance", () => {
  const TEMPLATES = [
    "2 lbs chicken breast",
    "1 dozen eggs",
    "½ gal milk",
    "1 (14 oz) can diced tomatoes",
    "2 cans of black beans, drained",
    "bag of spinach",
    "eggs x12",
    "milk - 1 gal $3.49",
    "- 1 1/2 cups flour",
    "a couple of onions",
    "salt, pepper",
    "2-3 apples",
    "half a dozen eggs",
    "5-spice powder",
    "chicken breast 2 lbs",
    "3 cloves garlic, minced",
    "1,000 g rice",
    "CHKN BRST 2.13 lb @ $5.99/lb   12.76",
    "about 2 lbs ground beef",
    "2% milk",
  ]
  const hundredLines = Array.from({ length: 100 }, (_, i) => TEMPLATES[i % TEMPLATES.length]).join("\n")

  function time(fn: () => void): number {
    const start = performance.now()
    fn()
    return performance.now() - start
  }

  it("parses a 100-line paste well under 50 ms", () => {
    expect(parseLines(hundredLines)).toHaveLength(105) // the 5 "salt, pepper" lines give two items each
    expect(time(() => parseLines(hundredLines))).toBeLessThan(50)
  })

  it("parses every keystroke of a long line quickly", () => {
    const line = "2 (15 oz) cans of organic low sodium black beans, rinsed and drained well - $3.49"
    expect(
      time(() => {
        for (let i = 1; i <= line.length; i++) parseLine(line.slice(0, i))
      }),
    ).toBeLessThan(50)
  })

  // Each of these made at least one regex backtrack quadratically before; 5,000 characters took up to 220 ms.
  const PATHOLOGICAL: [string, string][] = [
    ["digits", "1".repeat(5000)],
    ["digits and spaces", "1 ".repeat(2500)],
    ["a run of spaces", `1${" ".repeat(5000)}x`],
    ["a run of spaces between words", `a${" ".repeat(5000)}b`],
    ["a run of tabs", `a${"\t".repeat(5000)}b`],
    ["a run of dashes", `a${"-".repeat(5000)}b`],
    ["dashes before trailing words", `a${"-".repeat(5000)}b-c-d-e-f-g-h-i-j-k-l-m-n-o-p`],
    ["spaces before trailing words", `a${" ".repeat(5000)}b c d e f g h i j k l m n o p q r s`],
    ["spaces inside a package size", `1 (1 oz${" ".repeat(5000)}x`],
    ["dots and spaces", `a${". ".repeat(2500)}b`],
    ["thousands groups", `1${",000".repeat(1250)}x`],
    ["slashes", "1/".repeat(2500)],
    ["mixed numbers", "1 1/2 ".repeat(850)],
    ["open parentheses", `1 ${"(".repeat(5000)}`],
    ["and", "1 and ".repeat(900)],
    ["articles", "a ".repeat(2500)],
    ["dollar signs", `milk ${" $".repeat(2500)}1`],
    ["times signs", `eggs ${"x ".repeat(2500)}12`],
    ["fraction glyphs", "1 ½".repeat(1700)],
    ["of", `2 cans${" of".repeat(1700)}`],
    ["list markers", `${"- ".repeat(2500)}eggs`],
    ["numbered markers", `${"1. ".repeat(1700)}eggs`],
    ["commas and digits", "1,".repeat(2500)],
    ["many short lines", "1\n".repeat(2500)],
    ["many items", "2 lbs chicken; ".repeat(330)],
  ]

  it.each(PATHOLOGICAL)("stays fast on 5,000 characters of %s", (_, text) => {
    expect(text.length).toBeGreaterThanOrEqual(4900)
    expect(time(() => parseLine(text))).toBeLessThan(50)
    expect(time(() => parseLines(text))).toBeLessThan(50)
  })

  it("scales linearly (50,000 characters)", () => {
    for (const unit of [" ", "-", "1 ", "a ", "(", ". ", "$1 ", "½ "]) {
      const text = `a${unit.repeat(50_000 / unit.length)}b`
      expect(time(() => parseLines(text)), JSON.stringify(unit)).toBeLessThan(100)
    }
  })
})

describe("invariants over every input above", () => {
  it.each(ALL_INPUTS)("%j", (input) => {
    const parsed = mustParse(input)
    expect(parsed.raw.startsWith(parsed.amountText)).toBe(true)
    expect(parsed.raw).toBe(parsed.raw.trim())
    expect(isUnit(parsed.unit)).toBe(true)
    if (parsed.quantity !== null) {
      expect(Number.isFinite(parsed.quantity)).toBe(true)
      expect(parsed.quantity).toBeGreaterThanOrEqual(0)
    }
    expect(parsed.name).toBe(parsed.name.toLowerCase())
    expect(parsed.name).toBe(parsed.name.trim())
    expect(parsed.name).not.toMatch(/\s{2}|[.,;:!?\-–—/(]$/)
    expect(parsed.name).not.toMatch(/^of\s/)
    // parseLines of a single line with no separators is the same line
    if (!/[,;•\n]/.test(input)) expect(parseLines(input)).toEqual([parsed])
  })
})
