#!/usr/bin/env node
// Builds src/lib/ingredients/library/data.ts, the ingredient library behind autocomplete and
// categorizing (src/lib/ingredients/catalog.ts).
//
//   node scripts/build-ingredient-library.mjs          write data.ts and print a summary
//   node scripts/build-ingredient-library.mjs --check  exit 1 if data.ts is out of date
//   node scripts/build-ingredient-library.mjs --list [category|rules|unknown|fix]   print Spoonacular-only rows
//   node scripts/build-ingredient-library.mjs --list merged   curated entries and the Spoonacular ids they took
//   node scripts/build-ingredient-library.mjs --list ids      entries that share a Spoonacular id
//
// Sources:
//   data/spoonacular/ingredients-with-possible-units.csv  every Spoonacular ingredient (name;id;units)
//   data/ingredients/<category>.txt   curated everyday groceries, one per line (format below)
//   data/ingredients/spoonacular.txt  fixes for Spoonacular rows the curated lists don't name:
//     "name => category" files a row, "name -> curated name" folds it into that entry (its name
//     becomes an alias), "name ~tier" sets its tier; combinable ("name => spices ~5").
//
// Curated line format:   name [~tier] [: alias, alias …] [| unit, unit …]
//   "@units lb, oz, count" sets the units for the lines after it, "@tier 2" the tier; "#" starts a comment.
//   tier: 1 staple most households buy, 2 very common, 3 common (default), 4 less common, 5 rare.
//   A curated name or alias that normalizes like a Spoonacular name takes over that row (and its id).
//
// Node 22.18+ runs the shared TypeScript helpers directly (type stripping).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// The helpers are .ts files in a package without "type": "module"; Node warns once per file.
process.removeAllListeners("warning")
process.on("warning", (warning) => {
  if (warning.code !== "MODULE_TYPELESS_PACKAGE_JSON" && warning.name !== "ExperimentalWarning") console.warn(warning)
})

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const LIBRARY_DIR = path.join(ROOT, "src/lib/ingredients/library")
const { normalizeIngredientName, ingredientWords, foldText } = await import(path.join(LIBRARY_DIR, "normalize.ts"))
const { categoryByRules, qualifierCategory, ruleAtEnd } = await import(path.join(LIBRARY_DIR, "rules.ts"))
const { createMatcher } = await import(path.join(LIBRARY_DIR, "match.ts"))

const CSV_PATH = path.join(ROOT, "data/spoonacular/ingredients-with-possible-units.csv")
const CURATED_DIR = path.join(ROOT, "data/ingredients")
const FIXES_PATH = path.join(CURATED_DIR, "spoonacular.txt")
const OUT_PATH = path.join(LIBRARY_DIR, "data.ts")

/** Same order as CATEGORIES in src/lib/ingredients/types.ts. */
const CATEGORY_KEYS = [
  "produce",
  "bakery",
  "meat",
  "seafood",
  "dairy",
  "frozen",
  "grains",
  "baking",
  "canned",
  "condiments",
  "spices",
  "snacks",
  "beverages",
  "other",
]

/** Canonical unit keys from src/lib/units. */
const UNIT_KEYS = new Set(
  "g kg oz lb ml l tsp tbsp cup fl_oz pt qt gal count can jar bottle bag box package bunch head clove slice stick loaf carton"
    .split(" ")
    .map((u) => u.replace("_", " ")),
)

/** Units for Spoonacular rows that no curated entry covers, by category. */
const DEFAULT_UNITS = {
  produce: ["count", "lb", "oz", "bunch"],
  bakery: ["count", "package", "loaf", "slice"],
  meat: ["lb", "oz", "package", "count"],
  seafood: ["lb", "oz", "count", "package"],
  dairy: ["oz", "package", "cup", "lb"],
  frozen: ["bag", "oz", "box", "package", "lb"],
  grains: ["lb", "oz", "box", "bag", "cup"],
  baking: ["lb", "oz", "cup", "bag", "g"],
  canned: ["can", "oz", "jar", "cup"],
  condiments: ["bottle", "jar", "oz", "fl oz", "tbsp"],
  spices: ["oz", "jar", "tsp", "tbsp", "g"],
  snacks: ["bag", "oz", "box", "package"],
  beverages: ["bottle", "can", "fl oz", "l", "package"],
  other: ["package", "oz", "count"],
}

/**
 * Units by what a Spoonacular-only row is, from its last word, when no curated entry in the same
 * category looks like it ("lemon juice" is poured, not counted like lemons).
 */
const UNITS_BY_LAST_WORD = {
  juice: ["bottle", "fl oz", "cup", "tbsp"],
  nectar: ["bottle", "can", "fl oz", "cup"],
  zest: ["tsp", "tbsp", "count"],
  peel: ["tsp", "tbsp", "count"],
  wedge: ["count"],
  extract: ["bottle", "fl oz", "tsp", "tbsp"],
  essence: ["bottle", "fl oz", "tsp", "tbsp"],
  oil: ["bottle", "fl oz", "tbsp", "cup"],
  vinegar: ["bottle", "fl oz", "tbsp", "cup"],
  syrup: ["bottle", "fl oz", "tbsp", "cup"],
  sauce: ["bottle", "jar", "oz", "tbsp"],
  paste: ["jar", "oz", "tbsp", "tsp"],
  puree: ["can", "oz", "cup"],
  pulp: ["can", "oz", "cup"],
  leaf: ["bunch", "oz", "package"],
  broth: ["carton", "can", "cup", "qt"],
  stock: ["carton", "can", "cup", "qt"],
  soup: ["can", "oz", "cup"],
  coffee: ["bag", "oz", "lb", "package"],
  espresso: ["bag", "oz", "package"],
  tea: ["box", "package", "count"],
  bag: ["box", "count", "package"],
}

/** Spoonacular's unit words → canonical keys (others, like "serving" or "pinch", are dropped). */
const SPOONACULAR_UNITS = {
  g: "g",
  gram: "g",
  kg: "kg",
  oz: "oz",
  ounce: "oz",
  pound: "lb",
  lb: "lb",
  ml: "ml",
  liter: "l",
  l: "l",
  cup: "cup",
  tablespoon: "tbsp",
  teaspoon: "tsp",
  "fluid ounce": "fl oz",
  pint: "pt",
  quart: "qt",
  gallon: "gal",
  can: "can",
  tin: "can",
  "can or bottle": "can",
  jar: "jar",
  bottle: "bottle",
  bag: "bag",
  box: "box",
  package: "package",
  packet: "package",
  pack: "package",
  envelope: "package",
  sachet: "package",
  bunch: "bunch",
  head: "head",
  clove: "clove",
  slice: "slice",
  stick: "stick",
  loaf: "loaf",
  carton: "carton",
  piece: "count",
  unit: "count",
  small: "count",
  medium: "count",
  large: "count",
  "extra large": "count",
  jumbo: "count",
  whole: "count",
  fruit: "count",
}

/** Spoonacular rows with these words rank last in autocomplete (tier 5). */
const RARE_WORDS =
  /\b(?:cooked|leftover|of choice|homemade|prepared|mashed|poached|hard boiled|gluten free|sugar free|reduced fat|reduced sodium|low fat|fat free|nonfat|low sodium|lower sodium|less sodium|light|lite|low carb|low sugar|no salt added|allergy friendly|vegan|vegetarian|diet|nfs)\b/

const MAX_UNITS = 5
/** Storage words: a curated match that already names one ("frozen peas") isn't overridden by it. */
const QUALIFIER_WORD = /^(?:frozen|canned|dried|dry|pickled)$/

/** How many of `phrase`'s last words `words` also ends with, in order. */
function tailLength(words, phrase) {
  let n = 0
  while (n < words.length && n < phrase.length && words[words.length - 1 - n] === phrase[phrase.length - 1 - n]) n++
  return n
}
const args = process.argv.slice(2)

// ── Read sources ──────────────────────────────────────────────────────────────────────────────

function fail(messages) {
  for (const message of messages) console.error(`✗ ${message}`)
  process.exit(1)
}

function parseUnitList(text, where, errors) {
  const units = text
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
  for (const unit of units) if (!UNIT_KEYS.has(unit)) errors.push(`${where}: unknown unit "${unit}"`)
  return units
}

function readCurated() {
  const errors = []
  const entries = []
  for (const category of CATEGORY_KEYS) {
    const file = path.join(CURATED_DIR, `${category}.txt`)
    if (!fs.existsSync(file)) continue
    let units = DEFAULT_UNITS[category]
    let tier = 3
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/)
    lines.forEach((raw, i) => {
      const where = `data/ingredients/${category}.txt:${i + 1}`
      const line = raw.replace(/#.*$/, "").trim()
      if (!line) return
      if (line.startsWith("@units")) {
        units = parseUnitList(line.slice("@units".length), where, errors)
        return
      }
      if (line.startsWith("@tier")) {
        tier = Number(line.slice("@tier".length).trim())
        if (!(tier >= 1 && tier <= 5)) errors.push(`${where}: bad tier`)
        return
      }
      const [head, unitText] = line.split("|")
      const [nameText, aliasText] = head.split(":")
      const tierMatch = /\s*~(\d)\s*$/.exec(nameText)
      const name = (tierMatch ? nameText.slice(0, tierMatch.index) : nameText).trim().toLowerCase()
      const aliases = (aliasText ?? "")
        .split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
      if (!name || /[|;]/.test(name)) errors.push(`${where}: bad name`)
      entries.push({
        name,
        category,
        tier: tierMatch ? Number(tierMatch[1]) : tier,
        aliases,
        units: unitText === undefined ? units : parseUnitList(unitText, where, errors),
        where,
      })
    })
  }
  if (errors.length) fail(errors)
  return entries
}

function readSpoonacular() {
  return fs
    .readFileSync(CSV_PATH, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, id, units = ""] = line.split(";")
      return {
        name: name.trim().toLowerCase(),
        id: Number(id),
        units: units
          .split(",")
          .map((u) => u.trim().toLowerCase())
          .filter(Boolean),
      }
    })
}

/** name => category | name -> curated name | name ~tier (combinable: "name => spices ~4"). */
function readFixes() {
  const fixes = new Map()
  if (!fs.existsSync(FIXES_PATH)) return fixes
  const errors = []
  fs.readFileSync(FIXES_PATH, "utf8")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const where = `data/ingredients/spoonacular.txt:${i + 1}`
      let line = raw.replace(/#.*$/, "").trim()
      if (!line) return
      const fix = {}
      const tierMatch = /\s*~(\d)\s*$/.exec(line)
      if (tierMatch) {
        fix.tier = Number(tierMatch[1])
        line = line.slice(0, tierMatch.index)
      }
      const merge = line.split("->")
      const file = line.split("=>")
      let name = line
      if (merge.length === 2) {
        name = merge[0]
        fix.mergeInto = merge[1].trim().toLowerCase()
      } else if (file.length === 2) {
        name = file[0]
        fix.category = file[1].trim()
        if (!CATEGORY_KEYS.includes(fix.category)) errors.push(`${where}: unknown category "${fix.category}"`)
      }
      name = name.trim().toLowerCase()
      if (fixes.has(name)) errors.push(`${where}: "${name}" is listed twice`)
      fixes.set(name, { ...fix, where })
    })
  if (errors.length) fail(errors)
  return fixes
}

// ── Build ─────────────────────────────────────────────────────────────────────────────────────

function build() {
  const curated = readCurated()
  const rows = readSpoonacular()
  const fixes = readFixes()
  const errors = []

  /** @type {{name: string, category: string, tier: number, aliases: string[], units: string[], id: number|null, moreIds: number[], curated: boolean, from?: string}[]} */
  const entries = []
  const byKey = new Map() // name and alias keys → entry
  const keyOwner = new Map() // key → description, for error messages

  for (const item of curated) {
    const key = normalizeIngredientName(item.name)
    if (!key) {
      errors.push(`${item.where}: "${item.name}" normalizes to nothing`)
      continue
    }
    if (byKey.has(key)) {
      errors.push(`${item.where}: "${item.name}" is the same ingredient as ${keyOwner.get(key)}`)
      continue
    }
    const entry = { ...item, id: null, moreIds: [], curated: true, aliases: [], rows: [] }
    entries.push(entry)
    byKey.set(key, entry)
    keyOwner.set(key, `"${item.name}" (${item.where})`)
    for (const alias of item.aliases) {
      const aliasKey = normalizeIngredientName(alias)
      if (!aliasKey || aliasKey === key || entry.aliases.some((a) => normalizeIngredientName(a) === aliasKey)) continue
      if (byKey.has(aliasKey)) {
        errors.push(`${item.where}: alias "${alias}" of "${item.name}" already means ${keyOwner.get(aliasKey)}`)
        continue
      }
      entry.aliases.push(alias)
      byKey.set(aliasKey, entry)
      keyOwner.set(aliasKey, `"${item.name}" (alias "${alias}", ${item.where})`)
    }
  }

  const curatedMatcher = createMatcher(
    entries.flatMap((entry, index) => [
      { key: normalizeIngredientName(entry.name), entry: index, tier: entry.tier },
      ...entry.aliases.map((alias) => ({ key: normalizeIngredientName(alias), entry: index, tier: entry.tier })),
    ]),
  )

  // Spoonacular rows: shortest names first, so "tomato" (not "whole tomato") gives an entry its id.
  const sorted = [...rows].sort((a, b) => foldText(a.name).length - foldText(b.name).length || a.name.localeCompare(b.name))
  const usedFixes = new Set()
  const pending = []
  for (const row of sorted) {
    const key = normalizeIngredientName(row.name)
    const fix = fixes.get(row.name)
    if (fix) usedFixes.add(row.name)
    let target = null
    if (fix?.mergeInto) {
      target = byKey.get(normalizeIngredientName(fix.mergeInto))
      if (!target) errors.push(`${fix.where}: no entry named "${fix.mergeInto}"`)
    } else {
      target = byKey.get(key)
    }
    if (target) {
      if (fix?.mergeInto && !byKey.has(key)) {
        // Folded in by a fix: its name becomes an alias, so it's found and suggested as this entry.
        target.aliases.push(row.name)
        byKey.set(key, target)
        keyOwner.set(key, `"${target.name}" (alias "${row.name}", ${fix.where})`)
      }
      target.rows?.push(row.name)
      // Its own name's row gives the primary id; alias rows add more ids.
      const ownName = normalizeIngredientName(target.name) === key
      if (target.id === null && (ownName || !target.curated)) target.id = row.id
      else if (target.id !== row.id && !target.moreIds.includes(row.id)) target.moreIds.push(row.id)
      if (fix?.tier) target.tier = fix.tier
      continue
    }
    const entry = { name: row.name, category: "", tier: 4, aliases: [], units: [], id: row.id, moreIds: [], curated: false }
    entries.push(entry)
    byKey.set(key, entry)
    keyOwner.set(key, `Spoonacular "${row.name}"`)
    pending.push({ entry, row, key, fix })
  }
  for (const [name, fix] of fixes) if (!usedFixes.has(name)) errors.push(`${fix.where}: no Spoonacular row "${name}"`)

  // Curated entries whose only Spoonacular rows were aliases: take the first alias row's id.
  // An alias row can carry the same id as the entry's own row ("yeast" and "active dry yeast").
  for (const entry of entries) {
    if (entry.curated && entry.id === null && entry.moreIds.length) entry.id = entry.moreIds.shift()
    entry.moreIds = [...new Set(entry.moreIds)].filter((id) => id !== entry.id)
  }

  // File the new Spoonacular entries: a fix; else the curated entry they look like or the keyword
  // rule for their last words, whichever names more of the end ("soy butter": the rule's "soy
  // butter" beats the curated "butter"; "banana liqueur": "liqueur" beats a match on "banana";
  // "chocolate mint": the herb and the candy rule tie on "mint" and the curated herb wins); a storage
  // word overrides a curated match ("pickled daikon" → canned).
  for (const { entry, row, key, fix } of pending) {
    const words = ingredientWords(row.name).join(" ")
    const match = curatedMatcher.find(key)
    const like = match ? entries[match.entry] : null
    const rule = ruleAtEnd(words)
    let category = fix?.category ?? null
    let from = "fix"
    if (!category && like && !(rule && rule.length > tailLength(match.words, key.split(" ")))) {
      category = like.category
      from = `like "${like.name}"`
      const qualified = qualifierCategory(key)
      if (qualified && qualified !== category && !match.words.some((w) => QUALIFIER_WORD.test(w))) {
        category = qualified
        from += ` (${qualified})`
      }
    }
    if (!category) {
      category = categoryByRules(words)
      from = "rules"
    }
    if (!category) {
      category = "other"
      from = "unknown"
    }
    entry.category = category
    entry.from = from
    entry.tier = fix?.tier ?? (RARE_WORDS.test(row.name) ? 5 : 4)
    const own = [...new Set(row.units.map((u) => SPOONACULAR_UNITS[u]).filter(Boolean))]
    const lastWord = words.split(" ").pop()
    const base = like && like.category === category ? like.units : (UNITS_BY_LAST_WORD[lastWord] ?? DEFAULT_UNITS[category])
    entry.units = [...new Set([...base, ...own])].slice(0, MAX_UNITS)
  }

  if (errors.length) fail(errors)
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return { entries, rows }
}

// ── Output ────────────────────────────────────────────────────────────────────────────────────

function render(entries) {
  const unitSets = []
  const unitSetIndex = new Map()
  const lines = entries.map((entry) => {
    const units = entry.units.join(",")
    if (!unitSetIndex.has(units)) {
      unitSetIndex.set(units, unitSets.length)
      unitSets.push(units)
    }
    const fields = [
      entry.name,
      CATEGORY_KEYS.indexOf(entry.category),
      entry.tier,
      unitSetIndex.get(units),
      entry.id ?? "",
      entry.aliases.join(","),
      entry.moreIds.join(","),
    ]
    while (fields.length > 5 && fields[fields.length - 1] === "") fields.pop()
    return fields.join("|")
  })
  for (const line of lines) if (/[`\\$]/.test(line)) fail([`can't embed "${line}" in a template literal`])

  return `// GENERATED by scripts/build-ingredient-library.mjs. Do not edit: change data/ingredients/*.txt and rerun.
// Base: every row of data/spoonacular/ingredients-with-possible-units.csv (Spoonacular ids kept),
// plus curated everyday groceries. ${entries.length} entries.
//
// ROWS has one entry per line: name|category|tier|units|id|aliases|more ids
//   category  index into CATEGORY_KEYS
//   tier      1 (staple most households buy) … 5 (rare); ranks autocomplete
//   units     index into UNIT_SETS (canonical unit keys, most natural first)
//   id        Spoonacular ingredient id, empty for entries we added
//   aliases   other names people type, comma-separated (optional)
//   more ids  other Spoonacular ids that mean the same ingredient, comma-separated (optional)

export const CATEGORY_KEYS = ${JSON.stringify(CATEGORY_KEYS)} as const

export const UNIT_SETS: readonly string[] = ${JSON.stringify(unitSets)}

export const ROWS = \`
${lines.join("\n")}
\`
`
}

function summarize(entries) {
  const byCategory = Object.fromEntries(CATEGORY_KEYS.map((c) => [c, 0]))
  const byTier = {}
  for (const entry of entries) {
    byCategory[entry.category]++
    byTier[entry.tier] = (byTier[entry.tier] ?? 0) + 1
  }
  const curated = entries.filter((e) => e.curated).length
  const withId = entries.filter((e) => e.id !== null).length
  console.log(`${entries.length} entries (${curated} curated, ${withId} with a Spoonacular id)`)
  console.log("by category:", byCategory)
  console.log("by tier:", byTier)
}

const { entries } = build()
const output = render(entries)

if (args[0] === "--list" && args[1] === "ids") {
  const byId = new Map()
  for (const entry of entries) {
    for (const id of [entry.id, ...entry.moreIds]) {
      if (id === null) continue
      byId.set(id, [...(byId.get(id) ?? []), entry])
    }
  }
  for (const [id, shared] of byId) {
    if (shared.length > 1) console.log(`${id}: ${shared.map((e) => `${e.name} (${e.category}${e.id === id ? "" : ", folded in"})`).join(" | ")}`)
  }
} else if (args[0] === "--list") {
  const what = args[1]
  for (const entry of entries) {
    if (what === "merged" ? entry.curated && entry.rows.length : !entry.curated && (what === undefined || entry.category === what || entry.from === what)) {
      const from = what === "merged" ? `← ${entry.rows.join("; ")}` : entry.from
      console.log(`${entry.category.padEnd(10)} ${entry.tier} ${entry.name}  [${entry.units.join(" ")}] ${from} ${entry.id ?? ""} ${entry.moreIds.join(",")}`)
    }
  }
} else if (args[0] === "--check") {
  const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, "utf8") : ""
  if (current !== output) fail(["src/lib/ingredients/library/data.ts is out of date: run node scripts/build-ingredient-library.mjs"])
  console.log("data.ts is up to date")
} else {
  fs.writeFileSync(OUT_PATH, output)
  summarize(entries)
  console.log(`wrote ${path.relative(ROOT, OUT_PATH)} (${(Buffer.byteLength(output) / 1024).toFixed(1)} KB)`)
}
