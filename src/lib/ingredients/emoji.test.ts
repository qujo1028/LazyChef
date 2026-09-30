import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { findIngredient, normalizeIngredientName } from "./catalog"
import { EMOJI_ALLOW_LIST, emojiTableEntries, ingredientEmoji } from "./emoji"
import { CATEGORY_KEYS, ROWS } from "./library/data"
import { CATEGORIES, CATEGORY_META, type Category, type CatalogEntry } from "./types"

/** Library entries by commonness tier (1 staple … 5 rare), parsed straight from the rows. */
const ENTRIES = ROWS.split("\n")
  .filter(Boolean)
  .map((line) => {
    const [name, category, tier, , , aliases = ""] = line.split("|")
    return {
      tier: Number(tier),
      entry: { name, category: CATEGORY_KEYS[Number(category)] as Category, aliases: aliases ? aliases.split(",") : [] },
    }
  })
const COMMON = ENTRIES.filter(({ tier }) => tier <= 3).map(({ entry }) => entry)

const graphemes = (text: string) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)]

describe("ingredientEmoji", () => {
  it.each([
    ["eggs", "🥚"],
    ["milk", "🥛"],
    ["butter", "🧈"],
    ["garlic", "🧄"],
    ["chicken breast", "🍗"],
    ["salmon", "🐟"],
    ["cherry tomatoes", "🍅"],
    ["chicken thighs", "🍗"],
    ["cheddar cheese", "🧀"],
    ["shrimp", "🍤"],
    ["ginger", "🫚"],
    ["shallots", "🧅"],
    ["green beans", "🫛"],
    ["jalapeños", "🌶️"],
    ["red bell pepper", "🫑"],
    ["fresh basil", "🌿"],
    ["jasmine rice", "🍚"],
    ["penne", "🍝"],
    ["ramen noodles", "🍜"],
    ["all-purpose flour", "🌾"],
    ["red wine", "🍷"],
    ["beer", "🍺"],
    ["ground coffee", "☕"],
    ["green tea", "🍵"],
    ["honey", "🍯"],
    ["chicken noodle soup", "🥫"],
    ["strawberry jam", "🫙"],
  ])("%s → %s", (name, emoji) => {
    expect(ingredientEmoji(name)).toBe(emoji)
  })

  it.each([
    ["Eggs", "🥚"],
    ["EGG", "🥚"],
    ["Fresh Tomatoes", "🍅"],
    ["2% milk", "🥛"],
    ["boneless skinless chicken thighs", "🍗"],
    ["strawberries", "🍓"],
    ["blueberries", "🫐"],
    ["potatoes", "🥔"],
    ["peaches", "🍑"],
    ["mangoes", "🥭"],
    ["anchovies", "🐟"],
    ["cookies", "🍪"],
  ])("handles case, plurals and filler words: %s → %s", (name, emoji) => {
    expect(ingredientEmoji(name)).toBe(emoji)
  })

  it("matches the end of a longer name, longest first", () => {
    expect(ingredientEmoji("kerrygold unsalted butter")).toBe("🧈")
    expect(ingredientEmoji("sweet potato")).toBe("🍠") // not 🥔
    expect(ingredientEmoji("chocolate chip cookies")).toBe("🍪") // not 🍫
    expect(ingredientEmoji("almond milk")).toBe("🥛") // not 🌰
    expect(ingredientEmoji("coconut milk")).toBe("🥥") // not 🥛
    expect(ingredientEmoji("tuna steaks")).toBe("🐟") // not 🥩
    expect(ingredientEmoji("egg noodles")).toBe("🍜") // not 🥚
    expect(ingredientEmoji("hot dog buns")).toBe("📦") // not 🌭
  })

  it("uses a library entry's aliases", () => {
    const scallions = findIngredient("scallions")!
    const vineTomatoes = findIngredient("tomatoes on the vine")!
    expect(ingredientEmoji(vineTomatoes)).toBe("🍅") // via "vine tomatoes"
    expect(ingredientEmoji(findIngredient("garbanzo beans")!)).toBe("🫘")
    expect(ingredientEmoji(findIngredient("aubergine")!)).toBe("🍆")
    expect(ingredientEmoji(findIngredient("courgette")!)).toBe("🥒")
    expect(ingredientEmoji(findIngredient("prawns")!)).toBe("🍤")
    // Green onions aren't bulbs: the category emoji, not 🧅.
    expect(ingredientEmoji(scallions)).toBe(CATEGORY_META.produce.emoji)
  })

  it("aliases typed on their own", () => {
    expect(ingredientEmoji("aubergine")).toBe("🍆")
    expect(ingredientEmoji("courgette")).toBe("🥒")
    expect(ingredientEmoji("garbanzo beans")).toBe("🫘")
    expect(ingredientEmoji("prawns")).toBe("🍤")
    expect(ingredientEmoji("string beans")).toBe("🫛")
    expect(ingredientEmoji("mozzarella")).toBe("🧀")
  })

  it("falls back to the category emoji", () => {
    expect(ingredientEmoji({ name: "sour cream", category: "dairy" })).toBe(CATEGORY_META.dairy.emoji)
    expect(ingredientEmoji({ name: "za'atar", category: "spices" })).toBe(CATEGORY_META.spices.emoji)
    expect(ingredientEmoji({ name: "dish soap", category: "other" })).toBe("📦")
    expect(ingredientEmoji({ name: "", category: "frozen" })).toBe(CATEGORY_META.frozen.emoji)
    // A bare string with no match, or an unknown category: "Other".
    expect(ingredientEmoji("mystery thing")).toBe("📦")
    expect(ingredientEmoji({ name: "x", category: "nope" as Category })).toBe("📦")
    expect(ingredientEmoji({ name: "x", category: null })).toBe("📦")
  })

  it("prefers the category over a misleading emoji", () => {
    const cases: [string, Category][] = [
      ["peanut butter", "condiments"], // 🥜, not 🧈
      ["almond butter", "condiments"],
      ["baking soda", "baking"],
      ["cauliflower rice", "produce"],
      ["rice cakes", "snacks"],
      ["english muffins", "bakery"],
      ["water chestnuts", "canned"],
      ["green onions", "produce"],
      ["crushed red pepper", "spices"],
      ["cayenne pepper", "spices"],
      ["black pepper", "spices"],
      ["almond flour", "baking"],
      ["clam juice", "canned"],
      ["olive oil", "condiments"],
      ["chili", "canned"],
      ["celery ribs", "produce"],
      ["breath mints", "snacks"],
      ["coffee filters", "other"],
    ]
    for (const [name, category] of cases) {
      const emoji = ingredientEmoji({ name, category })
      if (name === "peanut butter") expect(emoji).toBe("🥜")
      else expect(emoji, name).toBe(CATEGORY_META[category].emoji)
    }
  })

  it("follows the item's category when it has no emoji of its own", () => {
    // Moved to Frozen by the household: the fallback follows.
    expect(ingredientEmoji({ name: "leftover soup base", category: "frozen" })).toBe("🧊")
  })

  it("maps the common staples", () => {
    for (const name of ["salt", "olive oil", "vegetable oil", "sugar", "black pepper"]) {
      expect(EMOJI_ALLOW_LIST.has(ingredientEmoji(name)) || ingredientEmoji(name) === "📦").toBe(true)
    }
    expect(ingredientEmoji("salt")).toBe("🧂")
    expect(ingredientEmoji("all-purpose flour")).toBe("🌾")
  })
})

describe("coverage (tier 1–3 library entries)", () => {
  it("gives most common ingredients their own emoji", () => {
    const own = COMMON.filter((entry) => ingredientEmoji(entry) !== CATEGORY_META[entry.category].emoji)
    // 794 common entries; many others share the category's emoji legitimately (milk 🥛, salt 🧂).
    expect(own.length).toBeGreaterThanOrEqual(350)
  })

  it("never gives an alias a different emoji than its entry (only the entry's, or the category's)", () => {
    // Genuinely different things under one entry.
    const allowed = new Set(["noodles", "waffle mix"])
    const conflicts: string[] = []
    for (const entry of COMMON) {
      const own = ingredientEmoji(entry)
      const fallback = CATEGORY_META[entry.category].emoji
      for (const alias of entry.aliases) {
        const emoji = ingredientEmoji({ name: alias, category: entry.category })
        if (emoji !== own && emoji !== fallback && !allowed.has(alias)) {
          conflicts.push(`${alias} (${entry.name}): ${emoji}, entry ${own}`)
        }
      }
    }
    expect(conflicts).toEqual([])
  })

  it("covers library entries of every tier without throwing", () => {
    for (const { entry } of ENTRIES) expect(EMOJI_ALLOW_LIST.has(ingredientEmoji(entry)) || isCategoryEmoji(ingredientEmoji(entry))).toBe(true)
  })
})

describe("the table", () => {
  const table = emojiTableEntries()

  it("has one emoji grapheme per value", () => {
    for (const emoji of [...new Set(table.map(([, emoji]) => emoji))].filter(Boolean)) {
      const segments = graphemes(emoji)
      expect(segments, emoji).toHaveLength(1)
      expect(/\p{Extended_Pictographic}/u.test(emoji), emoji).toBe(true)
    }
    for (const { emoji } of CATEGORIES) expect(graphemes(emoji)).toHaveLength(1)
  })

  it("only uses emojis from the allow-list", () => {
    for (const [name, emoji] of table) {
      if (emoji) expect(EMOJI_ALLOW_LIST.has(emoji), `${name}: ${emoji}`).toBe(true)
    }
    for (const emoji of EMOJI_ALLOW_LIST) expect(graphemes(emoji)).toHaveLength(1)
  })

  it("stores keys the way lookups normalize them", () => {
    for (const [name] of table) expect(normalizeIngredientName(name)).toBe(name)
    expect(table.some(([name]) => name === "")).toBe(false)
  })

  it("lists each name once", () => {
    const source = fs.readFileSync(path.join(__dirname, "emoji.ts"), "utf8")
    const block = source.slice(source.indexOf("const TABLE = `") + 15, source.indexOf("`\n", source.indexOf("const TABLE = `")))
    const names = block
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => line.slice(line.indexOf(" ") + 1).split(","))
      .map(normalizeIngredientName)
    const seen = new Set<string>()
    const duplicates = names.filter((name) => (seen.has(name) ? true : (seen.add(name), false)))
    expect(duplicates).toEqual([])
  })

  it("is compact", () => {
    // Ships to phones: keep the table small (a few KB), not a copy of the library.
    expect(table.length).toBeLessThan(900)
  })
})

describe("speed", () => {
  it("looks up 20,000 names in well under a second", () => {
    const names = COMMON.flatMap((entry) => [entry.name, ...entry.aliases])
    const entries: CatalogEntry[] = COMMON.map((entry) => ({ ...entry, id: null, units: [] }))
    ingredientEmoji("warm up")
    const start = performance.now()
    let count = 0
    while (count < 20_000) {
      ingredientEmoji(names[count % names.length])
      ingredientEmoji(entries[count % entries.length])
      count += 2
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(500)
  })
})

function isCategoryEmoji(emoji: string): boolean {
  return CATEGORIES.some((category) => category.emoji === emoji)
}
