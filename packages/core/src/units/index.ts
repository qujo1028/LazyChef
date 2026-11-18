// OWNER: parser agent. Contract stub — keep these exports and signatures.
// Pure module (no Node/Next APIs); used on both server and client.

export type Dimension = "mass" | "volume" | "count" | "package"

type UnitDef = {
  key: string
  dimension: Dimension
  /** Grams (mass) or millilitres (volume) per unit; 1 for count/package units (never converted). */
  factor: number
  /** Word shown after a number: "cup", "lb", "L". "" for count. */
  singular: string
  plural: string
  /** Short label for unit pickers. */
  label: string
  /** Show ½ ¼ ¾ ⅓ ⅔ ⅛ instead of decimals (US and whole-item units). Metric stays decimal. */
  fractions: boolean
  /** Lowercase spellings that mean this unit (besides the key itself). */
  aliases: string[]
}

// US customary units use their exact legal definitions, so whole-number relationships hold
// (16 oz = 1 lb, 3 tsp = 1 tbsp, 16 tbsp = 1 cup, 4 qt = 1 gal) up to float precision.
const US_TSP_ML = 4.92892159375

const measure = (
  key: string,
  dimension: "mass" | "volume",
  factor: number,
  fractions: boolean,
  aliases: string[],
  word = key,
  plural = word,
): UnitDef => ({ key, dimension, factor, singular: word, plural, label: word, fractions, aliases })

const pkg = (key: string, plural: string, aliases: string[] = []): UnitDef => ({
  key,
  dimension: "package",
  factor: 1,
  singular: key,
  plural,
  label: key,
  fractions: true,
  aliases: [plural, ...aliases],
})

/** Every canonical unit, in picker order. */
const UNIT_DEFS: readonly UnitDef[] = [
  {
    key: "count",
    dimension: "count",
    factor: 1,
    singular: "",
    plural: "",
    label: "each",
    fractions: true,
    aliases: ["ct", "cts", "ea", "each", "pc", "pcs", "piece", "pieces"],
  },
  measure("lb", "mass", 453.59237, true, ["lbs", "pound", "pounds", "#"]),
  measure("oz", "mass", 28.349523125, true, ["ozs", "ounce", "ounces"]),
  measure("g", "mass", 1, false, ["gs", "gr", "grs", "gm", "gms", "gram", "grams", "gramme", "grammes"]),
  measure("kg", "mass", 1000, false, ["kgs", "kilo", "kilos", "kilogram", "kilograms", "kilogramme", "kilogrammes"]),
  measure("gal", "volume", US_TSP_ML * 768, true, ["gals", "gallon", "gallons"]),
  measure("qt", "volume", US_TSP_ML * 192, true, ["qts", "quart", "quarts"]),
  measure("pt", "volume", US_TSP_ML * 96, true, ["pts", "pint", "pints"]),
  measure("cup", "volume", US_TSP_ML * 48, true, ["cups", "c"], "cup", "cups"),
  measure("fl oz", "volume", US_TSP_ML * 6, true, [
    "floz",
    "fl ozs",
    "fl ounce",
    "fl ounces",
    "fluid oz",
    "fluid ounce",
    "fluid ounces",
  ]),
  measure("l", "volume", 1000, false, ["lt", "ltr", "ltrs", "liter", "liters", "litre", "litres"], "L"),
  measure("ml", "volume", 1, false, ["mls", "cc", "milliliter", "milliliters", "millilitre", "millilitres"]),
  measure("tbsp", "volume", US_TSP_ML * 3, true, ["tbsps", "tbs", "tbl", "tbls", "tablespoon", "tablespoons"]),
  measure("tsp", "volume", US_TSP_ML, true, ["tsps", "teaspoon", "teaspoons"]),
  pkg("can", "cans", ["tin", "tins"]),
  pkg("jar", "jars"),
  pkg("bottle", "bottles"),
  pkg("bag", "bags"),
  pkg("box", "boxes"),
  pkg("package", "packages", ["pkg", "pkgs", "pack", "packs", "packet", "packets", "pk", "pkt", "pkts"]),
  pkg("bunch", "bunches"),
  pkg("head", "heads"),
  pkg("clove", "cloves"),
  pkg("slice", "slices"),
  pkg("stick", "sticks"),
  pkg("loaf", "loaves"),
  pkg("carton", "cartons"),
]

const DEFS = new Map<string, UnitDef>(UNIT_DEFS.map((def) => [def.key, def]))

const ALIASES = new Map<string, string>()
for (const def of UNIT_DEFS) {
  ALIASES.set(def.key, def.key)
  for (const alias of def.aliases) ALIASES.set(alias, def.key)
}

/** Canonical unit keys, in picker order. */
export const UNITS: readonly string[] = UNIT_DEFS.map((def) => def.key)

/** Choices for unit pickers, canonical keys with display labels. */
export const UNIT_OPTIONS: { value: string; label: string }[] = UNIT_DEFS.map((def) => ({
  value: def.key,
  label: def.label,
}))

/** True for a canonical unit key ("lb", "fl oz", "count", …), false for aliases and unknown strings. */
export function isUnit(unit: string): boolean {
  return DEFS.has(unit)
}

/**
 * "lbs" → "lb", "Tablespoons" → "tbsp", "fl. oz." → "fl oz", "dozen" → null (dozen is handled by the parser as ×12).
 * Case-insensitive, except the single letters "T" (tbsp) and "t" (tsp). Unknown → null.
 */
export function normalizeUnit(input: string): string | null {
  const cleaned = input.replace(/\./g, " ").replace(/\s+/g, " ").trim()
  if (cleaned === "T") return "tbsp"
  if (cleaned === "t") return "tsp"
  const lower = cleaned.toLowerCase()
  return ALIASES.get(lower) ?? ALIASES.get(lower.replace(/ /g, "")) ?? null
}

/** Canonical key for a canonical key or alias; null when unknown. */
function canonical(unit: string): string | null {
  return DEFS.has(unit) ? unit : normalizeUnit(unit)
}

/** Dimension of a unit (aliases accepted). Unknown units count as "count". */
export function unitDimension(unit: string): Dimension {
  const key = canonical(unit)
  return (key && DEFS.get(key)?.dimension) || "count"
}

/**
 * Converts within a dimension (mass↔mass, volume↔volume); count and package units only convert to
 * themselves. Aliases are accepted. null if impossible. Not rounded: format with formatQuantity.
 */
export function convertQuantity(quantity: number, from: string, to: string): number | null {
  if (!Number.isFinite(quantity)) return null
  if (from === to) return quantity
  const fromKey = canonical(from)
  const toKey = canonical(to)
  if (!fromKey || !toKey) return null
  if (fromKey === toKey) return quantity
  const a = DEFS.get(fromKey)
  const b = DEFS.get(toKey)
  if (!a || !b || a.dimension !== b.dimension) return null
  if (a.dimension !== "mass" && a.dimension !== "volume") return null
  return (quantity * a.factor) / b.factor
}

/** True when convertQuantity(x, from, to) would succeed. */
export function canConvert(from: string, to: string): boolean {
  return convertQuantity(1, from, to) !== null
}

const FRACTIONS: readonly [number, string][] = [
  [0, ""],
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [1, ""],
]
const FRACTION_TOLERANCE = 0.02

/** Formats the number part: "1½" / "1.5". `value` is what was displayed, for pluralizing. */
function formatNumber(quantity: number, fractions: boolean): { text: string; value: number } {
  const sign = quantity < 0 ? "-" : ""
  const abs = Math.abs(quantity)
  if (fractions) {
    const whole = Math.floor(abs)
    const frac = abs - whole
    for (const [value, glyph] of FRACTIONS) {
      if (Math.abs(frac - value) > FRACTION_TOLERANCE) continue
      const shown = whole + value
      // A tiny amount would snap to "0"; let the decimal path show it instead.
      if (shown === 0 && abs >= 0.005) break
      const text = glyph ? (whole ? `${whole}${glyph}` : glyph) : String(shown)
      return { text: shown === 0 ? "0" : sign + text, value: shown }
    }
  }
  const rounded = Math.round(abs * 100) / 100
  return { text: rounded === 0 ? "0" : sign + String(rounded), value: rounded }
}

function unitWord(def: UnitDef, shownValue: number): string {
  const singular = shownValue > 0 && shownValue <= 1
  return singular ? def.singular : def.plural
}

/**
 * The unit as shown after a number: formatUnit("cup", 2) → "cups", formatUnit("lb", 2) → "lb",
 * formatUnit("l") → "L", formatUnit("count") → "". Unknown units are returned as given.
 */
export function formatUnit(unit: string, quantity = 1): string {
  const key = canonical(unit)
  const def = key ? DEFS.get(key) : undefined
  if (!def) return unit
  return unitWord(def, Math.abs(quantity))
}

/**
 * Short display for lists: "2 lb", "12", "1½ cups", "¾ lb", "250 g", "1.5 kg", "3 cans", "2 loaves".
 * null quantity → "" (the UI shows its own "on hand" label). At most 2 decimals, no trailing zeros;
 * US and whole-item units use ½ ¼ ¾ ⅓ ⅔ ⅛ when close. Aliases are accepted ("lbs" → "lb").
 */
export function formatQuantity(quantity: number | null, unit: string): string {
  if (quantity === null || !Number.isFinite(quantity)) return ""
  const key = canonical(unit)
  const def = key ? DEFS.get(key) : undefined
  if (!def) {
    const { text } = formatNumber(quantity, false)
    return unit.trim() ? `${text} ${unit.trim()}` : text
  }
  const { text, value } = formatNumber(quantity, def.fractions)
  const word = unitWord(def, Math.abs(value))
  return word ? `${text} ${word}` : text
}
