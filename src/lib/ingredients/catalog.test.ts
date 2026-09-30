import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { isUnit } from "@/lib/units"

import {
  findIngredient,
  getIngredientById,
  guessCategory,
  normalizeIngredientName,
  searchIngredients,
} from "./catalog"
import { CATEGORY_KEYS, ROWS, UNIT_SETS } from "./library/data"
import { CATEGORIES, type Category, type CatalogEntry } from "./types"

const ROOT = path.resolve(__dirname, "../../..")

/** Names of the suggestions for a query. */
function names(query: string, limit?: number): string[] {
  return searchIngredients(query, limit).map((entry) => entry.name)
}

/** Every library entry, reached through the public API (each row's name finds its entry). */
const ROW_FIELDS = ROWS.split("\n")
  .filter(Boolean)
  .map((line) => line.split("|"))

function mustFind(name: string): CatalogEntry {
  const entry = findIngredient(name)
  if (!entry) throw new Error(`findIngredient(${JSON.stringify(name)}) returned null`)
  return entry
}

describe("normalizeIngredientName", () => {
  it.each([
    // lowercase, trim, punctuation, spaces
    ["Fresh Tomatoes", "tomato"],
    ["  Organic   Baby Spinach ", "baby spinach"],
    ["Reese's Pieces", "reese piece"],
    ["Jalapeños", "jalapeno"],
    ["Salt & Pepper", "salt and pepper"],
    ["2% Milk", "2 percent milk"],
    ["all-purpose flour", "all purpose flour"],
    // filler words dropped
    ["Large Eggs", "egg"],
    ["extra large eggs", "egg"],
    ["small red onions", "red onion"],
    ["ripe bananas", "banana"],
    ["raw almonds", "almond"],
    ["chopped onion", "onion"],
    ["finely minced garlic", "garlic"],
    ["thinly sliced shallots", "shallot"],
    ["whole garlic", "garlic"],
    ["organic fresh ripe medium avocados", "avocado"],
    // … unless they change what the thing is
    ["Whole Milk", "whole milk"],
    ["whole wheat flour", "whole wheat flour"],
    ["whole chicken", "whole chicken"],
    ["diced tomatoes", "diced tomato"],
    ["fresh mozzarella", "fresh mozzarella"],
    ["fresh thyme", "fresh thyme"],
    ["sliced almonds", "sliced almond"],
    ["raw sugar", "raw sugar"],
    // the last word is always kept
    ["raw", "raw"],
    ["small", "small"],
    // singular, with exceptions
    ["berries", "berry"],
    ["Bay Leaves", "bay leaf"],
    ["potatoes", "potato"],
    ["peaches", "peach"],
    ["cookies", "cookie"],
    ["brownies", "brownie"],
    ["hummus", "hummus"],
    ["asparagus", "asparagus"],
    ["couscous", "couscous"],
    ["molasses", "molasses"],
    ["Swiss cheese", "swiss cheese"],
    ["grits", "grits"],
    ["glass", "glass"],
    // "peppers" alone are bell peppers; "pepper" is black pepper
    ["peppers", "peppers"],
    ["fresh peppers", "peppers"],
    ["red peppers", "red pepper"],
    ["pepper", "pepper"],
    // nothing left
    ["", ""],
    ["   ", ""],
    ["!!!", ""],
  ])("%j → %j", (input, expected) => {
    expect(normalizeIngredientName(input)).toBe(expected)
  })

  it("caps keys at 80 characters without a trailing space", () => {
    const key = normalizeIngredientName("super ".repeat(20) + "long name")
    expect(key.length).toBeLessThanOrEqual(80)
    expect(key).toBe(key.trim())
  })

  it("is stable: normalizing a key gives the same key", () => {
    for (const [name, , , , , aliases = ""] of ROW_FIELDS) {
      for (const text of [name, ...(aliases ? aliases.split(",") : [])]) {
        const key = normalizeIngredientName(text)
        expect(normalizeIngredientName(key), text).toBe(key)
      }
    }
  })
})

describe("findIngredient", () => {
  it.each([
    // exact names and aliases, however they're typed
    ["Fresh Tomatoes", "tomatoes"],
    ["scallions", "green onions"],
    ["2% milk", "2% milk"],
    ["large eggs", "eggs"],
    ["garlic cloves", "garlic"],
    ["hamburger", "ground beef"],
    ["cream", "heavy cream"],
    ["peppers", "bell peppers"],
    ["pepper", "black pepper"],
    ["tuna in water", "canned tuna"],
    ["butter sticks", "butter"],
    // the most specific entry whose words the name contains
    ["organic baby spinach", "baby spinach"],
    ["kerrygold unsalted butter", "unsalted butter"],
    ["boneless skinless chicken breasts", "chicken breast"],
    ["trader joe's creamy peanut butter", "peanut butter"],
    ["can of black beans", "black beans"],
    ["carrot sticks", "carrots"],
    ["pasta sauce with meat", "pasta sauce"],
    ["chicken breast boneless skinless", "chicken breast"],
    ["80/20 ground beef", "ground chuck"],
  ])("%j → %j", (input, expected) => {
    expect(findIngredient(input)?.name).toBe(expected)
  })

  it.each([
    ["dish soap"],
    ["paper towels"],
    ["coffee filters"],
    ["kitchen sponges"],
    ["trash bags"],
    ["birthday candles"],
    ["chicken salad sandwich"],
    ["xyzzy"],
    ["a"],
    [""],
    ["   "],
  ])("%j → null", (input) => {
    expect(findIngredient(input)).toBeNull()
  })

  it("prefers the name that ends like the typed one over an equally long look-alike", () => {
    // "unsalted peanut butter" is peanut butter, not unsalted butter
    expect(findIngredient("organic unsalted peanut butter")?.category).toBe("condiments")
    expect(findIngredient("reduced fat chocolate milk")?.name).toMatch(/chocolate milk/)
  })

  it("keeps Spoonacular ids and returns full entries", () => {
    const entry = mustFind("chicken breast")
    expect(entry).toMatchObject({ name: "chicken breast", category: "meat" })
    expect(entry.id).toBe(5062)
    expect(entry.aliases).toContain("boneless skinless chicken breast")
    expect(entry.units[0]).toBe("lb")
  })
})

describe("searchIngredients", () => {
  it.each([[""], ["   "], ["!!!"]])("%j → []", (query) => {
    expect(searchIngredients(query)).toEqual([])
  })

  it("respects the limit (8 by default)", () => {
    expect(searchIngredients("c")).toHaveLength(8)
    expect(searchIngredients("c", 3)).toHaveLength(3)
    expect(searchIngredients("c", 20)).toHaveLength(20)
    expect(searchIngredients("c", 0)).toEqual([])
  })

  it("puts everyday items first: 'chi' → chicken before chia seeds and chipotles", () => {
    const top = names("chi")
    expect(top.slice(0, 3)).toContain("chicken breast")
    expect(top.every((name) => /(?:^| )chi/.test(name))).toBe(true)
    const many = names("chi", 60)
    expect(many.indexOf("chicken breast")).toBeLessThan(many.indexOf("chia seeds"))
    expect(many.indexOf("chia seeds")).toBeGreaterThan(-1)
    expect(many.indexOf("chicken breast")).toBeLessThan(many.indexOf("chipotle peppers in adobo"))
  })

  it.each([
    // [query, first result, also in the top 8]
    ["egg", "eggs", ["eggplant", "egg noodles"]],
    ["bre", "bread", ["chicken breast", "bread crumbs"]],
    ["gre", "green beans", ["greek yogurt", "green onions"]],
    ["tom", "tomatoes", ["tomato paste", "tomato sauce", "cherry tomatoes"]],
    ["chi bre", "chicken breast", []],
    ["Tomatoes", "tomatoes", ["tomato paste"]],
    ["CHI", "chicken broth", ["chicken breast"]],
    // a whole alias or name puts its entry first
    ["scallions", "green onions", []],
    ["garbanzo", "chickpeas", []],
    ["fresh basil", "basil", []],
    ["peppers", "bell peppers", ["black pepper"]],
    // accents and plurals
    ["jalapeño", "jalapeños", []],
    ["strawberry", "strawberries", []],
    ["cherries", "cherries", ["cherry tomatoes"]],
  ])("%j → %j first", (query, first, alsoIncludes) => {
    const top = names(query)
    expect(top[0]).toBe(first)
    for (const name of alsoIncludes) expect(top).toContain(name)
  })

  it("matches later words and aliases, returning the canonical entry once", () => {
    expect(names("scal")).toContain("green onions") // alias "scallions"
    expect(names("hamb")).toContain("ground beef") // alias "hamburger"
    expect(names("bre")).toContain("white bread") // later word
    expect(names("scallion").filter((name) => name === "green onions")).toHaveLength(1)
  })

  it("never returns an entry twice", () => {
    for (const query of ["c", "chi", "egg", "bre", "gre", "tom", "chi bre", "pepper", "milk", "oil", "sauce", "cheese"]) {
      const results = searchIngredients(query, 50)
      expect(new Set(results).size, query).toBe(results.length)
      expect(new Set(results.map((entry) => entry.name)).size, query).toBe(results.length)
    }
  })

  it("matches every typed word, in order, at the start of a word of the name or an alias", () => {
    for (const query of ["chi", "gre", "chi bre", "gr be", "sw po", "ol oi"]) {
      const prefixes = query.split(" ")
      for (const entry of searchIngredients(query, 30)) {
        const matches = [entry.name, ...entry.aliases].some((name) => {
          const words = name.toLowerCase().split(/[^a-z0-9]+/)
          let at = 0
          return prefixes.every((prefix) => {
            while (at < words.length && !words[at].startsWith(prefix) && !prefix.startsWith(words[at])) at++
            return at++ < words.length
          })
        })
        expect(matches, `${query} → ${entry.name}`).toBe(true)
      }
    }
  })

  it("doesn't read a finished plural as a prefix: 'peas' isn't peanuts", () => {
    const top = names("peas", 30)
    expect(top).toContain("peas")
    expect(top).not.toContain("peanuts")
    expect(top).not.toContain("peanut butter")
  })

  it("ignores descriptive words when nothing matches with them", () => {
    expect(names("organic chi")).toEqual(names("chi"))
    expect(names("large eg")[0]).toBe("eggs")
  })

  it("falls back to the best containing entry when no name starts like the query", () => {
    expect(names("kerrygold unsalted butter")).toContain("unsalted butter")
  })

  it("is fast: well under 2 ms per call", () => {
    const queries = ["c", "ch", "chi", "chic", "b", "br", "bre", "brea", "t", "to", "tom", "s", "sa", "sal", "chi bre", "gre", "egg", "p", "pe", "zz"]
    searchIngredients("warm up")
    const start = performance.now()
    const rounds = 500
    for (let i = 0; i < rounds; i++) searchIngredients(queries[i % queries.length])
    const perCall = (performance.now() - start) / rounds
    expect(perCall).toBeLessThan(2)
  })
})

describe("getIngredientById", () => {
  it("finds entries by their own Spoonacular id and by ids folded into them", () => {
    expect(getIngredientById(5062)?.name).toBe("chicken breast")
    // Spoonacular's "boneless skinless chicken breast"
    expect(getIngredientById(1055062)?.name).toBe("chicken breast")
  })

  it.each([[-1], [0], [123456789], [Number.NaN]])("%d → null", (id) => {
    expect(getIngredientById(id)).toBeNull()
  })

  it("resolves every id in the library", () => {
    for (const [, , , , id, , moreIds = ""] of ROW_FIELDS) {
      if (id) expect(getIngredientById(Number(id))?.id, id).toBe(Number(id))
      for (const more of moreIds ? moreIds.split(",") : []) expect(getIngredientById(Number(more)), more).not.toBeNull()
    }
  })
})

describe("guessCategory", () => {
  it.each([
    ["oat milk", "dairy"],
    ["frozen dumplings", "frozen"],
    ["sriracha mayo", "condiments"],
    ["kombucha", "beverages"],
    ["earl grey", "beverages"],
    ["hot chocolate", "beverages"],
    ["vitamin water", "beverages"],
    ["coffee creamer", "dairy"],
    ["cheddar", "dairy"],
    ["ribeye", "meat"],
    ["beef skewers", "meat"],
    ["salmon burgers", "seafood"],
    ["razor clams", "seafood"],
    ["butter lettuce", "produce"],
    ["fresh thyme", "produce"],
    ["dried thyme", "spices"],
    ["garlic powder", "spices"],
    ["dried apricots", "snacks"],
    ["peanut butter cookies", "snacks"],
    ["chocolate shavings", "baking"],
    ["sponge cake", "bakery"],
    ["cream of wheat", "grains"],
    ["red lentils", "grains"],
    ["canned peaches", "canned"],
    ["peaches in syrup", "canned"],
    ["anchovies in olive oil", "canned"],
    ["pickled okra", "canned"],
    ["tofu scramble", "other"],
    ["seitan cutlets", "other"],
    // household things
    ["dish soap", "other"],
    ["paper towels", "other"],
    ["freezer bags", "other"],
    ["kitchen sponges", "other"],
    ["gummy vitamins", "other"],
    // nothing to go on
    ["xyzzy", "other"],
    ["", "other"],
  ] satisfies [string, Category][])("%j → %s", (name, expected) => {
    expect(guessCategory(name)).toBe(expected)
  })
})

describe("library data", () => {
  it("has 2,500+ entries and stays compact", () => {
    expect(ROW_FIELDS.length).toBeGreaterThanOrEqual(2500)
    const bytes = fs.statSync(path.join(__dirname, "library/data.ts")).size
    expect(bytes).toBeLessThan(300 * 1024)
  })

  it("lists categories in the same order as CATEGORIES", () => {
    expect([...CATEGORY_KEYS]).toEqual(CATEGORIES.map((category) => category.value))
  })

  it("has well-formed rows: name, category, tier, units, optional id, aliases and more ids", () => {
    for (const fields of ROW_FIELDS) {
      const [name, category, tier, units, id, aliases = "", moreIds = ""] = fields
      const where = fields.join("|")
      expect(fields.length, where).toBeGreaterThanOrEqual(5)
      expect(fields.length, where).toBeLessThanOrEqual(7)
      expect(name, where).toMatch(/^\S(?:.*\S)?$/)
      expect(name, where).toBe(name.toLowerCase())
      expect(CATEGORY_KEYS[Number(category)], where).toBeDefined()
      expect(Number(tier), where).toBeGreaterThanOrEqual(1)
      expect(Number(tier), where).toBeLessThanOrEqual(5)
      expect(UNIT_SETS[Number(units)], where).toBeDefined()
      if (id) expect(Number.isInteger(Number(id)) && Number(id) > 0, where).toBe(true)
      for (const alias of aliases ? aliases.split(",") : []) expect(alias, where).toMatch(/^\S(?:.*\S)?$/)
      for (const more of moreIds ? moreIds.split(",") : []) expect(Number(more) > 0, where).toBe(true)
    }
  })

  it("uses only canonical unit keys, with no repeats", () => {
    for (const set of UNIT_SETS) {
      const units = set.split(",")
      expect(units.length, set).toBeGreaterThan(0)
      expect(new Set(units).size, set).toBe(units.length)
      for (const unit of units) expect(isUnit(unit), `${unit} in ${set}`).toBe(true)
    }
  })

  it("gives every name and alias its own normalized key", () => {
    const owner = new Map<string, string>()
    for (const [name, , , , , aliases = ""] of ROW_FIELDS) {
      for (const text of [name, ...(aliases ? aliases.split(",") : [])]) {
        const key = normalizeIngredientName(text)
        expect(key, text).not.toBe("")
        expect(key.length, text).toBeLessThanOrEqual(80)
        const known = owner.get(key)
        if (known !== undefined) expect(known, `"${text}" and "${known}" share the key "${key}"`).toBe(name)
        owner.set(key, name)
      }
    }
  })

  it("finds and suggests every entry by its own name", () => {
    for (const [name, category] of ROW_FIELDS) {
      const found = findIngredient(name)
      expect(found?.name, name).toBe(name)
      expect(found?.category, name).toBe(CATEGORY_KEYS[Number(category)])
      expect(searchIngredients(name, 1)[0]?.name, name).toBe(name)
    }
  })

  it("keeps curated entries (no id) and Spoonacular ones", () => {
    const withId = ROW_FIELDS.filter((fields) => fields[4]).length
    expect(withId).toBeGreaterThan(2000)
    expect(ROW_FIELDS.length - withId).toBeGreaterThan(100)
  })

  it("is up to date with data/ingredients (build --check)", { timeout: 60_000 }, () => {
    const output = execFileSync(process.execPath, [path.join(ROOT, "scripts/build-ingredient-library.mjs"), "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    })
    expect(output).toContain("up to date")
  })
})

describe("eggplant vs eggs", () => {
  it("reads 'egg plant' (two words) as eggplant, not eggs", () => {
    for (const name of ["egg plant", "Egg Plants", "eggplants", "aubergine"]) expect(findIngredient(name)?.name).toBe("eggplant")
    for (const name of ["eggs", "egg", "Large Eggs"]) expect(findIngredient(name)?.name).toBe("eggs")
  })
})
