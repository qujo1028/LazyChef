// OWNER: parser agent. Contract stub — keep these exports and signatures.
// Pure module (no Node/Next APIs); used on both server and client. Runs on every keystroke,
// so it is a hand-written scanner over a few sticky regexes: no backtracking-heavy patterns.
import { normalizeUnit, unitDimension } from "@/lib/units"

import type { ParsedLine } from "./types"

// ── Numbers ────────────────────────────────────────────────────────────────

const FRACTION_GLYPHS: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅐": 1 / 7,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
  "⅑": 1 / 9,
  "⅒": 1 / 10,
}

const NUMBER_RE = new RegExp(
  [
    // 1½, 1 ½, ½
    `(?:(\\d+)[ \\t]*)?([${Object.keys(FRACTION_GLYPHS).join("")}])`,
    // 1 1/2, 1-1/2
    `(\\d+)(?:[ \\t]+|[ \\t]*-[ \\t]*)(\\d+)[ \\t]*[/⁄][ \\t]*(\\d+)`,
    // 1/2
    `(\\d+)[ \\t]*[/⁄][ \\t]*(\\d+)`,
    // 1,000 | 1,5 (decimal comma) | 1.5 | .5 | 12
    `(\\d{1,3}(?:,\\d{3})+(?![\\d,])|\\d+,\\d{1,2}(?![\\d,])|\\d*\\.\\d+|\\d+)`,
  ].join("|"),
  "y",
)

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
}

/** Word amounts. Longer phrases first; each must be followed by whitespace/punctuation/end. */
const WORD_RE = new RegExp(
  `(a[ \\t]+couple(?:[ \\t]+of)?|couple(?:[ \\t]+of)?|a[ \\t]+pair[ \\t]+of|pair[ \\t]+of|a[ \\t]+few` +
    `|a[ \\t]+half(?:[ \\t]+an?)?|half(?:[ \\t]+an?)?|a[ \\t]+quarter(?:[ \\t]+of)?|quarter` +
    `|${Object.keys(WORD_NUMBERS).join("|")}|an?)(?=[\\s,.;:)]|$)`,
  "iy",
)
const AND_RE = /[ \t]+and[ \t]+/iy
const AND_FRACTION_WORD_RE = /(a[ \t]+half|a[ \t]+quarter|three[ \t]+quarters)(?=[\s,.;:)]|$)/iy
const RANGE_RE = /[ \t]*[-–—][ \t]*|[ \t]+(?:to|or)[ \t]+/iy
const APPROX_RE = /(?:~|about|approx\.?|approximately|around|roughly)[ \t]*(?=[\d½¼¾⅓⅔⅛a-z])/iy
const VAGUE_RE = /(?:some|a[ \t]+lot[ \t]+of|lots[ \t]+of|a[ \t]+(?:little[ \t]+)?bit[ \t]+of|a[ \t]+little)[ \t]+(?=\S)/iy

// ── Units and connectors ───────────────────────────────────────────────────

const FLOZ_RE = /(?:fl|fluid)\.?[ \t]*(?:oz|ounces?)\.?/iy
const UNIT_TOKEN_RE = /(#|[a-z]+)\.?/iy
/** What may follow a unit token: "2 lbs chicken", "2 lb.", "2 cans(15 oz)". Not "-" ("2 T-bone steaks"). */
const AFTER_UNIT_RE = /[\s,;:()/.]/
const DOZEN_RE = /(?:[ \t]+|-)?(?:dozen|doz)\.?(?=[\s,;:)]|$)/iy
const BARE_DOZEN_RE = /(?:dozen|doz\.?)(?=[\s,;:)]|$)/iy
const TIMES_RE = /[ \t]*[x×](?=[\s\d])[ \t]*/iy
const PAREN_RE = /[ \t]*\([^()]*\)/y
const OF_RE = /[ \t]+of(?=\s|$)/iy
/** Separator between the amount and the name: "2 lbs - chicken", "2 lbs: chicken". */
const SEPARATOR_RE = /[ \t]*(?:[:,;.]+|[-–—]+(?=\s))?[ \t]*/y
/** A number must end at one of these, or at whitespace: rejects "7up", "2% milk", "5-spice". */
const AMOUNT_BOUNDARY_RE = /[\s,.;:)]/
/** Half-typed ranges and fractions at the end of the line ("2-", "1/") still count as amounts. */
const PARTIAL_REST_RE = /^[-–—/⁄]+$/

/** Unit words that can stand alone at the start of a line: "bag of spinach", "gallon milk", "head lettuce". */
const BARE_UNITS = new Set([
  "can",
  "jar",
  "bottle",
  "bag",
  "box",
  "package",
  "pack",
  "packet",
  "bunch",
  "head",
  "clove",
  "slice",
  "stick",
  "loaf",
  "carton",
  "gallon",
  "quart",
  "pint",
  "pound",
])
/** Unit words that need "of" to stand alone: "cup of rice" (but "cup noodles" is a name). */
const BARE_UNITS_WITH_OF = new Set([
  "cup",
  "ounce",
  "gram",
  "kilo",
  "kilogram",
  "liter",
  "litre",
  "milliliter",
  "millilitre",
  "teaspoon",
  "tablespoon",
])

// ── Line cleanup ───────────────────────────────────────────────────────────

/** List markers: "- ", "• ", "* ", "1. ", "2) ", "[ ] ", "☐ ". "1.5" and "1 egg" are amounts, not markers. */
const MARKER_RE =
  /^(?:[-*+•·◦▪‣⁃–—>]+[ \t]*|\[[ xX✓✔]?\][ \t]*|[☐☑☒✓✔✗✘][ \t]*|\d{1,3}[.)][ \t]+|\d{1,3}[.)](?=[^\d\s.,)])|\(\d{1,3}\)[ \t]+)/
const PRICE_RE = /[ \t]*(?:[-–—@:][ \t]*)?[$€£][ \t]?\d+(?:[.,]\d{1,2})?[ \t]*$/
const TRAILING_TIMES_RE = /^[x×][ \t]*(\d+(?:\.\d+)?)[\s).,;:!]*$/i
const TRAILING_REST_RE = /^[\s).,;:!]*$/
const NAME_EDGE_PUNCT = "\\s.,;:!?*•·/\\-–—"
const NAME_TRAILING_RE = new RegExp(`[${NAME_EDGE_PUNCT}]+$`)
const NAME_LEADING_RE = new RegExp(`^[${NAME_EDGE_PUNCT}]+`)

// ── Scanner helpers ────────────────────────────────────────────────────────

function execAt(re: RegExp, s: string, i: number): RegExpExecArray | null {
  re.lastIndex = i
  return re.exec(s)
}

function skipSpaces(s: string, i: number): number {
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++
  return i
}

type Quantity = { value: number; end: number; numeric: boolean; article: boolean }

function readNumber(s: string, i: number): { value: number; end: number } | null {
  const m = execAt(NUMBER_RE, s, i)
  if (!m) return null
  let value: number
  if (m[2] !== undefined) value = (m[1] ? Number(m[1]) : 0) + FRACTION_GLYPHS[m[2]]
  else if (m[5] !== undefined) value = Number(m[3]) + Number(m[4]) / Number(m[5])
  else if (m[7] !== undefined) value = Number(m[6]) / Number(m[7])
  else {
    const t = m[8]
    value = /^\d{1,3}(?:,\d{3})+$/.test(t) ? Number(t.replace(/,/g, "")) : Number(t.replace(",", "."))
  }
  return Number.isFinite(value) ? { value, end: m.index + m[0].length } : null
}

function readWordNumber(s: string, i: number): Quantity | null {
  const m = execAt(WORD_RE, s, i)
  if (!m) return null
  const word = m[1].toLowerCase().replace(/\s+/g, " ")
  let value: number
  if (word === "a" || word === "an") value = 1
  else if (word.includes("couple") || word.includes("pair")) value = 2
  else if (word === "a few") value = 3
  else if (word.includes("half")) value = 0.5
  else if (word.includes("quarter")) value = 0.25
  else value = WORD_NUMBERS[word]
  return { value, end: m.index + m[0].length, numeric: false, article: word === "a" || word === "an" }
}

/** A number or number phrase, with "and a half" and ranges ("2-3" → 2) folded in. */
function readQuantity(s: string, i: number): Quantity | null {
  const n = readNumber(s, i)
  const q: Quantity | null = n ? { ...n, numeric: true, article: false } : readWordNumber(s, i)
  if (!q) return null

  // "one and a half", "1 and 1/2"
  const and = execAt(AND_RE, s, q.end)
  if (and) {
    const j = and.index + and[0].length
    const word = execAt(AND_FRACTION_WORD_RE, s, j)
    const extra = word
      ? { value: /half/i.test(word[1]) ? 0.5 : /three/i.test(word[1]) ? 0.75 : 0.25, end: j + word[0].length }
      : readNumber(s, j)
    if (extra && extra.value < 1) {
      q.value += extra.value
      q.end = extra.end
      q.article = false
    }
  }

  // "2-3 apples", "2 to 3", "two or three" → first number
  if (!q.article) {
    const range = execAt(RANGE_RE, s, q.end)
    if (range) {
      const j = range.index + range[0].length
      const second = readNumber(s, j) ?? readWordNumber(s, j)
      if (second && !("article" in second && second.article)) q.end = second.end
    }
  }
  return q
}

type UnitMatch = { unit: string; end: number; pack: boolean }

/**
 * A unit token at i. `numeric` allows "500g" (no gap) and "14-oz" (hyphen gap); otherwise a space is needed.
 * The token must end at a boundary, so "2 cupcakes" and "2 T-bone steaks" have no unit.
 */
function readUnit(s: string, i: number, numeric: boolean): UnitMatch | null {
  let j = i
  if (numeric && s[j] === "-") j++
  else {
    j = skipSpaces(s, i)
    if (j === i && !numeric) return null
  }
  const floz = execAt(FLOZ_RE, s, j)
  if (floz) {
    const end = j + floz[0].length
    if (end < s.length && !AFTER_UNIT_RE.test(s[end])) return null
    return { unit: "fl oz", end, pack: false }
  }
  const m = execAt(UNIT_TOKEN_RE, s, j)
  if (!m) return null
  const end = j + m[0].length
  if (end < s.length && !AFTER_UNIT_RE.test(s[end])) return null
  const unit = normalizeUnit(m[1])
  if (!unit) return null
  return { unit, end, pack: /^(?:pack|pk)$/i.test(m[1]) }
}

function isMeasure(unit: string): boolean {
  const d = unitDimension(unit)
  return d === "mass" || d === "volume"
}

/** A package unit after optional spaces: "can", "cans", "bag". */
function readPackageUnit(s: string, i: number): UnitMatch | null {
  const u = readUnit(s, skipSpaces(s, i), true)
  return u && unitDimension(u.unit) === "package" ? u : null
}

/** A package size followed by a package unit: "(14 oz) can", "14-oz can", "15 oz cans". Returns the package unit. */
function readSizedPackage(s: string, i: number): UnitMatch | null {
  const j = skipSpaces(s, i)
  let k: number
  if (s[j] === "(") {
    const close = s.indexOf(")", j)
    if (close < 0) return null
    k = close + 1
  } else {
    const n = readNumber(s, j)
    if (!n) return null
    const u = readUnit(s, n.end, true)
    if (!u || !isMeasure(u.unit)) return null
    k = u.end
  }
  return readPackageUnit(s, k)
}

/** A measured amount: "400g", "1 lb". */
function readMeasure(s: string, i: number): { value: number; unit: string; end: number } | null {
  const n = readNumber(s, skipSpaces(s, i))
  if (!n) return null
  const u = readUnit(s, n.end, true)
  return u && isMeasure(u.unit) ? { value: n.value, unit: u.unit, end: u.end } : null
}

/** A parenthesized measured amount: "(14 oz)", "(15 oz each)". */
function readParenMeasure(s: string, i: number): { value: number; unit: string; end: number } | null {
  const j = skipSpaces(s, i)
  if (s[j] !== "(") return null
  const inner = readMeasure(s, j + 1)
  if (!inner) return null
  const close = /^[ \t]*(?:each|ea\.?)?[ \t]*\)/i.exec(s.slice(inner.end))
  return close ? { ...inner, end: inner.end + close[0].length } : null
}

type Amount = {
  quantity: number | null
  unit: string
  /** End of the amount itself. */
  amountEnd: number
  /** Start of the name (after separators, "of", spaces). */
  end: number
}

function finishAmount(s: string, quantity: number | null, unit: string, i: number): Amount {
  const sep = execAt(SEPARATOR_RE, s, i)
  return { quantity, unit, amountEnd: i, end: sep ? i + sep[0].length : i }
}

/** "bag of spinach", "dozen eggs", "gallon milk": a unit with no number means one of it. */
function readBareUnit(s: string, i: number, trailing: boolean): Amount | null {
  const dozen = execAt(BARE_DOZEN_RE, s, i)
  if (dozen) {
    let end = i + dozen[0].length
    const of = execAt(OF_RE, s, end)
    if (of) end += of[0].length
    return finishAmount(s, 12, "count", end)
  }
  if (trailing) return null
  const m = execAt(UNIT_TOKEN_RE, s, i)
  if (!m || m[1] === "#") return null
  const word = m[1].toLowerCase()
  let end = i + m[0].length
  const of = execAt(OF_RE, s, end)
  if (of) end += of[0].length
  else if (!BARE_UNITS.has(word) || !/^[ \t]+\S/.test(s.slice(end))) return null
  if (!BARE_UNITS.has(word) && !BARE_UNITS_WITH_OF.has(word)) return null
  const unit = normalizeUnit(word)
  return unit ? finishAmount(s, 1, unit, end) : null
}

/**
 * The amount at the start of `s`. In trailing mode (for "eggs 12", "milk - 1 gal") vague words,
 * a lone "a", and bare units other than "dozen" don't count.
 */
function readAmount(s: string, trailing: boolean): Amount | null {
  if (!trailing) {
    const vague = execAt(VAGUE_RE, s, 0)
    if (vague) return { quantity: null, unit: "count", amountEnd: vague[0].length, end: vague[0].length }
  }
  const approx = execAt(APPROX_RE, s, 0)
  const start = approx ? approx[0].length : 0
  const q = readQuantity(s, start)
  if (!q) return readBareUnit(s, start, trailing)
  // While typing "apple" / "onion", a lone "a" or "one" is the start of a name, not an amount.
  if (!trailing && !q.numeric && skipSpaces(s, q.end) >= s.length) return null

  let value = q.value
  let unit = "count"
  let i = q.end
  let explicit = false

  const times = q.numeric ? execAt(TIMES_RE, s, i) : null
  if (times) i += times[0].length

  const sized = readSizedPackage(s, i)
  if (sized) {
    // "1 (14 oz) can", "2 x 400g cans", "a 2 lb bag"
    unit = sized.unit
    i = sized.end
    explicit = true
  } else if (times) {
    // "2 x 400g pasta" → 800 g; "2x eggs" → 2
    const inner = readMeasure(s, i)
    if (inner) {
      value *= inner.value
      unit = inner.unit
      i = inner.end
      explicit = true
    }
  } else {
    const paren = readParenMeasure(s, i)
    const dozen = paren ? null : execAt(DOZEN_RE, s, i)
    if (paren) {
      // "2 (15 oz) black beans" → 30 oz
      value *= paren.value
      unit = paren.unit
      i = paren.end
      explicit = true
    } else if (dozen) {
      value *= 12
      i += dozen[0].length
      explicit = true
    } else {
      const u = readUnit(s, i, q.numeric)
      if (u) {
        explicit = true
        unit = u.unit
        i = u.end
        if (u.pack && value > 1) {
          unit = "count" // "12-pack", "6 pack beer"
        } else if (isMeasure(unit)) {
          const p = readPackageUnit(s, i) // "14 oz can", "5 lb bag"
          if (p) {
            value = 1
            unit = p.unit
            i = p.end
          }
        }
      }
    }
  }

  if (explicit) {
    const paren = execAt(PAREN_RE, s, i) // "2 cans (15 oz) black beans"
    if (paren) i += paren[0].length
    const of = execAt(OF_RE, s, i)
    if (of) i += of[0].length
  }
  if (trailing && q.article && !explicit) return null
  if (i < s.length && !AMOUNT_BOUNDARY_RE.test(s[i]) && !/\s/.test(s[i - 1]) && !PARTIAL_REST_RE.test(s.slice(i))) {
    return null
  }
  return finishAmount(s, value, unit, i)
}

/** "eggs x12", "eggs 12", "milk - 1 gal", "chicken breast 2 lbs", "bread (2 loaves)". */
function readTrailingAmount(s: string): { nameEnd: number; quantity: number | null; unit: string } | null {
  for (let p = Math.max(1, s.length - 40); p < s.length; p++) {
    if (!/[\s(:\-–—,]/.test(s[p - 1]) || /[\s(:\-–—,]/.test(s[p])) continue
    const head = s.slice(0, p).replace(/[\s(:\-–—,]+$/, "")
    if (!/[^\s\d.,;:!?()\-–—]/.test(head)) continue
    const tail = s.slice(p)
    const times = TRAILING_TIMES_RE.exec(tail)
    if (times) return { nameEnd: head.length, quantity: Number(times[1]), unit: "count" }
    const amount = readAmount(tail, true)
    if (amount && TRAILING_REST_RE.test(tail.slice(amount.amountEnd))) {
      return { nameEnd: head.length, quantity: amount.quantity, unit: amount.unit }
    }
  }
  return null
}

function stripMarkers(text: string): string {
  let s = text
  for (let n = 0; n < 3; n++) {
    const m = MARKER_RE.exec(s)
    if (!m) break
    s = s.slice(m[0].length)
  }
  return s.replace(PRICE_RE, "").trim()
}

function cleanName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(NAME_LEADING_RE, "")
    .replace(/^of\s+/, "")
    .replace(NAME_TRAILING_RE, "")
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * "2 lbs chicken breast" → { amountText: "2 lbs ", name: "chicken breast", quantity: 2, unit: "lb" }.
 * null for blank lines (or lines that are only a list marker).
 *
 * `raw` is the trimmed line with any list marker ("- ", "1. ", "[ ] ") and trailing price ("$3.99")
 * removed, so `raw.startsWith(amountText)` always holds. Amounts after the name ("eggs x12",
 * "milk - 1 gal") are understood too, with amountText "".
 */
export function parseLine(raw: string): ParsedLine | null {
  const text = stripMarkers(raw.trim())
  if (!text) return null

  const lead = readAmount(text, false)
  if (lead) {
    return {
      raw: text,
      amountText: text.slice(0, lead.end),
      name: cleanName(text.slice(lead.end)),
      quantity: lead.quantity,
      unit: lead.unit,
    }
  }
  const trail = readTrailingAmount(text)
  if (trail) {
    return {
      raw: text,
      amountText: "",
      name: cleanName(text.slice(0, trail.nameEnd)),
      quantity: trail.quantity,
      unit: trail.unit,
    }
  }
  return { raw: text, amountText: "", name: cleanName(text), quantity: null, unit: "count" }
}

/** Recipe-style notes after a comma: "2 cloves garlic, minced", "salt, to taste". Dropped by parseLines. */
const PREP_WORDS = new Set(
  (
    "chopped diced minced sliced grated shredded peeled seeded deseeded cubed crushed melted softened beaten " +
    "drained rinsed halved quartered trimmed julienned zested juiced cut into in pieces piece chunks strips " +
    "rings wedges cubes rounds bite sized inch inches finely roughly coarsely thinly thickly lightly freshly " +
    "well very small large medium thin thick lengthwise crosswise diagonally to taste for serving garnish " +
    "optional divided plus more extra at room temperature cold warm packed loosely firmly sifted thawed if " +
    "needed necessary as desired and or deveined pitted cored stemmed torn toasted mashed crumbled cooked " +
    "uncooked chilled removed reserved separated washed scrubbed dried patted dry squeezed broken with without"
  ).split(" "),
)

function isPrepNote(line: ParsedLine): boolean {
  if (line.quantity !== null || !line.name) return false
  return line.name
    .split(/[\s\-/]+/)
    .filter(Boolean)
    .every((word) => PREP_WORDS.has(word.replace(/[^a-z]/g, "")) || /^[\d½¼¾⅓⅔⅛./"]+$/.test(word))
}

/** Splits one line on commas (not "1,000" or inside parentheses), semicolons and inline bullets. */
function splitLine(line: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === "(") depth++
    else if (c === ")") depth = Math.max(0, depth - 1)
    else if (depth === 0 && (c === ";" || c === "•" || (c === "," && !(isDigit(line[i - 1]) && isDigit(line[i + 1]))))) {
      parts.push(line.slice(start, i))
      start = i + 1
    }
  }
  parts.push(line.slice(start))
  return parts
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9"
}

/**
 * Splits pasted text into items (newlines, semicolons, inline bullets, and commas that aren't inside
 * numbers like "1,000" or parentheses), drops blanks, and parses each. Within one line, an amount-only
 * piece joins the item before it ("chicken breast, 2 lbs"), recipe notes are dropped
 * ("2 cloves garlic, minced"), and a leading "and" is ignored ("eggs, milk, and bread").
 */
export function parseLines(text: string): ParsedLine[] {
  const items: ParsedLine[] = []
  for (const line of text.split(/\r\n?|\n|\u2028/)) {
    let prev: ParsedLine | null = null
    for (const [index, part] of splitLine(line).entries()) {
      const parsed = parseLine(index > 0 ? part.replace(/^\s*(?:and|&|or)\s+/i, "") : part)
      if (!parsed) continue
      if (prev && !parsed.name && parsed.quantity !== null && prev.quantity === null) {
        prev.quantity = parsed.quantity
        prev.unit = parsed.unit
        prev.raw = `${prev.raw}, ${parsed.raw}`
        continue
      }
      if (prev && isPrepNote(parsed)) continue
      items.push(parsed)
      prev = parsed
    }
  }
  return items
}
