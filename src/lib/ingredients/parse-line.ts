// OWNER: parser agent. Contract stub — keep these exports and signatures.
// Pure module (no Node/Next APIs); used on both server and client. Runs on every keystroke,
// so it is a hand-written scanner over a few sticky regexes: no backtracking-heavy patterns.
// Every regex is either sticky/anchored at a known position or run on a bounded slice, and
// nothing matches a run of repeated characters from each start position, so time stays linear
// in the line length (parse-line.test.ts has timing tests for pathological input).
import { convertQuantity, normalizeUnit, unitDimension } from "@/lib/units"

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
const VAGUE_RE =
  /(?:some|a[ \t]+lot[ \t]+of|lots[ \t]+of|a[ \t]+(?:little[ \t]+)?bit[ \t]+of|a[ \t]+little|(?:a[ \t]+)?(?:pinch|dash|handful|splash|sprinkle|drizzle|smidgen)[ \t]+of)[ \t]+(?=\S)/iy
/** "1 1/" while typing "1 1/2": a half-typed mixed fraction at the end of the line. */
const PARTIAL_FRACTION_RE = /[ \t]+\d{1,6}[ \t]*[/⁄][ \t]*$/y
/** A word amount followed by "and"/"&" is part of a name: "half and half", "half & half", "a & w root beer". */
const CONJUNCTION_RE = /[ \t]*(?:and|&|'?n'?|or)(?=[ \t]|$)/iy
/** Larger numbers are product codes or typos, not amounts (the review form accepts up to this too). */
const MAX_QUANTITY = 1_000_000

// ── Units and connectors ───────────────────────────────────────────────────

const FLOZ_RE = /(?:fl|fluid)\.?[ \t]*(?:oz|ounces?)\.?/iy
const UNIT_TOKEN_RE = /(#|[a-z]+)\.?/iy
/** What may follow a unit token: "2 lbs chicken", "2 lb.", "2 cans(15 oz)". Not "-" ("2 T-bone steaks"). */
const AFTER_UNIT_RE = /[\s,;:()/.]/
const DOZEN_RE = /(?:[ \t]+|-)?(?:dozen|doz)\.?(?=[\s,;:)]|$)/iy
const BARE_DOZEN_RE = /(?:dozen|doz\.?)(?=[\s,;:)]|$)/iy
const TIMES_RE = /[ \t]*[x×](?=[\s\d]|$)[ \t]*/iy
const PAREN_RE = /[ \t]*\([^()]*\)/y
/** The rest of "(15 oz each)" after the measure. Starts after skipSpaces, so it can't backtrack over spaces. */
const PAREN_CLOSE_RE = /(?:each|ea\.?)?[ \t]*\)/iy
const OF_RE = /[ \t]+of(?=\s|$)/iy
/** Separator between the amount and the name: "2 lbs - chicken", "2 lbs: chicken". */
const SEPARATOR_RE = /[ \t]*(?:[:,;.]+|[-–—]+(?=\s))?[ \t]*/y
/** A number must end at one of these, or at whitespace: rejects "7up", "2% milk", "5-spice". */
const AMOUNT_BOUNDARY_RE = /[\s,.;:)]/
/** Half-typed ranges and fractions at the end of the line ("2-", "1/") still count as amounts. */
const PARTIAL_REST_RE = /^[-–—/⁄]+$/

/**
 * Unit words that can stand alone at the start of a line: "bag of spinach", "gallon milk", "head lettuce".
 * Not "pound" ("pound cake"); "pound of beef" still works through BARE_UNITS_WITH_OF.
 */
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
])
/** Unit words that need "of" to stand alone: "cup of rice" (but "cup noodles" is a name). */
const BARE_UNITS_WITH_OF = new Set([
  "pound",
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
/**
 * Unit words that count as "one of it" after a name: "milk gal", "ice cream pint", "lettuce head" (receipts
 * write "MILK 2% GAL"). Not "stick", "slice" or "loaf" ("fish sticks", "meat loaf").
 */
const TRAILING_BARE_UNITS = new Set(["gal", "gallon", "qt", "quart", "pt", "pint", "head", "bunch", "carton"])

// ── Line cleanup ───────────────────────────────────────────────────────────

/** Spaces other than " " and "\t" (no-break spaces from web pages, the thin space in "1 ½"). */
const ODD_SPACE_RE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\f\v]/g
/** Invisible characters that would split a word or number: zero-width space, word joiner, BOM, soft hyphen. */
const INVISIBLE_RE = /[\u00ad\u200b\u2060\ufeff]/g
/**
 * List markers: "- ", "• ", "* ", "1. ", "2) ", "[ ] ", "☐ ", and a lone "2)" at the end of a line.
 * "1.5", "1." (a decimal being typed) and "1 egg" are amounts, not markers.
 */
const MARKER_RE =
  /^(?:[-*+•·◦▪‣⁃–—>]+[ \t]*|\[[ xX✓✔]?\][ \t]*|[☐☑☒✓✔✗✘][ \t]*|\d{1,3}[.)][ \t]+|\d{1,3}[.)](?=[^\d\s.,)])|\d{1,3}\)$|\(\d{1,3}\)[ \t]+)/
/**
 * A price at the end of a line, with an optional "-"/"@"/":" before it, a unit price ("/lb", " ea") and a
 * receipt tax flag ("F", "T"; not G or L, which are units): "$3.49", "- $3.49", "@ $0.59/lb", "3,49 €",
 * "4.29 F". A bare "3.49" (two decimals, no currency sign) is a price only after a name or "@", because
 * "3.25" on its own is an amount being typed. Only run on the last PRICE_WINDOW characters.
 */
const PRICE_RE =
  /(?:^|[ \t])(?:([-–—@:])[ \t]*)?(?:([$€£])[ \t]?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?[ \t]?([$€£])|\d+[.,]\d\d)(?:[ \t]*\/[ \t]*[a-zA-Z]{1,3}\.?|[ \t]+(?:ea|each|EA)\.?)?(?:[ \t]+[A-FH-KM-Z])?[ \t]*$/
const PRICE_WINDOW = 48
const LETTER_RE = /\p{L}/u
const TRAILING_TIMES_RE = /^[x×][ \t]*(\d+(?:\.\d+)?)[\s).,;:!]*$/i
const TRAILING_REST_RE = /^[\s).,;:!]*$/
const NAME_EDGE_PUNCT = "\\s.,;:!?*•·/\\-–—"
const NAME_EDGE_CHAR_RE = new RegExp(`[${NAME_EDGE_PUNCT}]`)
const NAME_LEADING_RE = new RegExp(`^[${NAME_EDGE_PUNCT}]+`)
/** Characters between a name and a trailing amount: "eggs x12", "milk - 1 gal", "bread (2 loaves)". */
const TRAIL_SEP_RE = /[\s(:\-–—,]/
/** Characters that can't make up a name by themselves. */
const NOT_NAME_RE = /[\s\d.,;:!?()\-–—]/
/** A name can't end in "and"/"&": "HALF & HALF QT" is not "half &" with ½ qt. Tested on a short slice. */
const ENDS_WITH_CONJUNCTION_RE = /(?:^|[ \t])(?:and|&|'?n'?|or)$/i

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
  return Number.isFinite(value) && value <= MAX_QUANTITY ? { value, end: m.index + m[0].length } : null
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

  // "1 1/" while typing "1 1/2 cups": keep the whole number, swallow the unfinished fraction.
  if (q.numeric && execAt(PARTIAL_FRACTION_RE, s, q.end)) q.end = s.length
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
  const close = execAt(PAREN_CLOSE_RE, s, skipSpaces(s, inner.end))
  return close ? { ...inner, end: close.index + close[0].length } : null
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

/**
 * "bag of spinach", "dozen eggs", "gallon milk": a unit with no number means one of it.
 * After a name (`trailing`), only "dozen" and TRAILING_BARE_UNITS: "eggs dozen", "milk gal".
 */
function readBareUnit(s: string, i: number, trailing: boolean): Amount | null {
  const dozen = execAt(BARE_DOZEN_RE, s, i)
  if (dozen) {
    let end = i + dozen[0].length
    const of = execAt(OF_RE, s, end)
    if (of) end += of[0].length
    return finishAmount(s, 12, "count", end)
  }
  const m = execAt(UNIT_TOKEN_RE, s, i)
  if (!m || m[1] === "#") return null
  const word = m[1].toLowerCase()
  let end = i + m[0].length
  if (trailing) {
    const unit = TRAILING_BARE_UNITS.has(word) ? normalizeUnit(word) : null
    return unit ? finishAmount(s, 1, unit, end) : null
  }
  const of = execAt(OF_RE, s, end)
  if (of) end += of[0].length
  else if (!BARE_UNITS.has(word) || !/^[ \t]+\S/.test(s.slice(end))) return null
  if (!BARE_UNITS.has(word) && !BARE_UNITS_WITH_OF.has(word)) return null
  const unit = normalizeUnit(word)
  return unit ? finishAmount(s, 1, unit, end) : null
}

/**
 * The amount at the start of `s`. In trailing mode (for "eggs 12", "milk - 1 gal") vague words,
 * word amounts without a unit ("tea for two", "half-and-half") and most bare units don't count.
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
  // A phrase ("a couple", "half a") is an amount even at the end.
  if (!trailing && !q.numeric && skipSpaces(s, q.end) >= s.length && !/[ \t]/.test(s.slice(start, q.end))) {
    return null
  }

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
          } else {
            // "1 lb 8 oz" → 1.5 lb, "1 cup 2 tbsp" → 1.125 cup
            const more = readMeasure(s, i)
            const extra = more && more.unit !== unit ? convertQuantity(more.value, more.unit, unit) : null
            if (more && extra !== null) {
              value += extra
              i = more.end
            }
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
  } else if (!q.numeric && (trailing || execAt(CONJUNCTION_RE, s, i))) {
    // "tea for two", "half and half", "half & half"
    return null
  }
  if (value > MAX_QUANTITY) return null
  if (i < s.length && !AMOUNT_BOUNDARY_RE.test(s[i]) && !/\s/.test(s[i - 1]) && !PARTIAL_REST_RE.test(s.slice(i))) {
    return null
  }
  return finishAmount(s, value, unit, i)
}

/** "eggs x12", "eggs 12", "milk - 1 gal", "chicken breast 2 lbs", "bread (2 loaves)". */
function readTrailingAmount(s: string): { nameEnd: number; quantity: number | null; unit: string } | null {
  // The name needs at least one real character before the amount ("2% milk 1 gal", not "1 2").
  let firstNameChar = 0
  while (firstNameChar < s.length && NOT_NAME_RE.test(s[firstNameChar])) firstNameChar++
  for (let p = Math.max(1, s.length - 40); p < s.length; p++) {
    if (!TRAIL_SEP_RE.test(s[p - 1]) || TRAIL_SEP_RE.test(s[p])) continue
    // Only the separator run just before p is walked, and runs don't overlap, so this stays linear.
    let nameEnd = p - 1
    while (nameEnd > 0 && TRAIL_SEP_RE.test(s[nameEnd - 1])) nameEnd--
    if (firstNameChar >= nameEnd) continue
    if (ENDS_WITH_CONJUNCTION_RE.test(s.slice(Math.max(0, nameEnd - 5), nameEnd))) continue
    const tail = s.slice(p)
    const times = TRAILING_TIMES_RE.exec(tail)
    if (times) return { nameEnd, quantity: Number(times[1]), unit: "count" }
    const amount = readAmount(tail, true)
    if (amount && TRAILING_REST_RE.test(tail.slice(amount.amountEnd))) {
      return { nameEnd, quantity: amount.quantity, unit: amount.unit }
    }
  }
  return null
}

function stripMarkers(s: string): string {
  for (let n = 0; n < 3; n++) {
    const m = MARKER_RE.exec(s)
    if (!m) break
    s = s.slice(m[0].length)
  }
  return s
}

/** `s` without the price at its end (see PRICE_RE), or null when it doesn't end in one. */
function stripPrice(s: string): string | null {
  const offset = Math.max(0, s.length - PRICE_WINDOW)
  const m = PRICE_RE.exec(offset ? s.slice(offset) : s)
  if (!m) return null
  const start = offset + m.index
  // Matched at the window's cut ("^"): the real character before it must be a boundary too.
  if (start > 0 && start === offset && !/[ \t]/.test(s[start]) && !/[ \t]/.test(s[start - 1])) return null
  const bare = !m[2] && !m[3]
  if (bare && m[1] !== "@" && !LETTER_RE.test(s.slice(0, start))) return null
  return s.slice(0, start).trimEnd()
}

/** Normalized spaces, no list marker and no trailing price(s): "- milk $3.49" → "milk". */
function cleanLine(raw: string): { text: string; priced: boolean } {
  let text = stripMarkers(raw.replace(INVISIBLE_RE, "").replace(ODD_SPACE_RE, " ").trim())
  let priced = false
  // Up to three: "CHKN 2.13 lb @ $5.99/lb 12.76" has a unit price and a total.
  for (let n = 0; n < 3; n++) {
    const stripped = stripPrice(text)
    if (stripped === null) break
    text = stripped
    priced = true
  }
  return { text: text.trim(), priced }
}

function cleanName(s: string): string {
  const name = s.toLowerCase().replace(/\s+/g, " ").replace(NAME_LEADING_RE, "").replace(/^of\s+/, "")
  // A loop, not a /[…]+$/ regex, which would rescan a long run of punctuation from every start position.
  let end = name.length
  while (end > 0 && (NAME_EDGE_CHAR_RE.test(name[end - 1]) || name[end - 1] === "(")) end--
  return name.slice(0, end)
}

// ── Public API ─────────────────────────────────────────────────────────────

function parse(raw: string): { line: ParsedLine; priced: boolean } | null {
  const { text, priced } = cleanLine(raw)
  if (!text) return null

  const lead = readAmount(text, false)
  if (lead) {
    const line = {
      raw: text,
      amountText: text.slice(0, lead.end),
      name: cleanName(text.slice(lead.end)),
      quantity: lead.quantity,
      unit: lead.unit,
    }
    return { line, priced }
  }
  const trail = readTrailingAmount(text)
  if (trail) {
    const line = {
      raw: text,
      amountText: "",
      name: cleanName(text.slice(0, trail.nameEnd)),
      quantity: trail.quantity,
      unit: trail.unit,
    }
    return { line, priced }
  }
  return { line: { raw: text, amountText: "", name: cleanName(text), quantity: null, unit: "count" }, priced }
}

/**
 * "2 lbs chicken breast" → { amountText: "2 lbs ", name: "chicken breast", quantity: 2, unit: "lb" }.
 * null for blank lines (or lines that are only a list marker or a price).
 *
 * `raw` is the trimmed line with odd spaces (no-break, thin) turned into plain spaces, invisible
 * characters removed, and any list marker ("- ", "1. ", "[ ] ") and trailing price ("$3.99", "@ 0.59/lb",
 * a receipt's bare "3.49") removed, so `raw.startsWith(amountText)` always holds. Amounts after the
 * name ("eggs x12", "milk - 1 gal") are understood too, with amountText "".
 */
export function parseLine(raw: string): ParsedLine | null {
  return parse(raw)?.line ?? null
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

/**
 * Splits one line on commas (not "1,000" or inside parentheses), semicolons and inline bullets.
 * An unclosed "(" would hide every later comma, so then the parentheses are ignored.
 */
function splitLine(line: string, parens = true): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (parens && c === "(") depth++
    else if (parens && c === ")") depth = Math.max(0, depth - 1)
    else if (depth === 0 && (c === ";" || c === "•" || (c === "," && !(isDigit(line[i - 1]) && isDigit(line[i + 1]))))) {
      parts.push(line.slice(start, i))
      start = i + 1
    }
  }
  if (depth > 0) return splitLine(line, false)
  parts.push(line.slice(start))
  return parts
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9"
}

const LINE_BREAK_RE = /\r\n?|[\n\v\f\u0085\u2028\u2029]/
const LEADING_AND_RE = /^\s*(?:and|&|or)\s+/i
/** Receipt lines that aren't food ("SUBTOTAL 45.12", "TAX 1.23", "VISA ****1234 46.35"); dropped only when priced. */
const RECEIPT_TOTAL_RE =
  /^(?:sub ?total|total(?: savings)?|(?:sales )?tax|balance(?: due)?|amount due|change(?: due)?|cash|credit|debit|visa|mastercard|amex|ebt|coupon|discount|savings|you saved)[^a-z]*$/

/**
 * Splits pasted text into items (newlines, semicolons, inline bullets, and commas that aren't inside
 * numbers like "1,000" or parentheses), drops blanks, and parses each. An amount-only piece joins the
 * item before it when that item has no amount ("chicken breast, 2 lbs", or "2 @ 0.99" on the line under
 * a receipt item). Recipe notes after a comma are dropped ("2 cloves garlic, minced"), a leading "and"
 * is ignored ("eggs, milk, and bread"), and priced receipt totals ("TOTAL $46.35") are skipped.
 */
export function parseLines(text: string): ParsedLine[] {
  const items: ParsedLine[] = []
  let prev: ParsedLine | null = null
  for (const line of text.split(LINE_BREAK_RE)) {
    for (const [index, part] of splitLine(line).entries()) {
      const result = parse(index > 0 ? part.replace(LEADING_AND_RE, "") : part)
      if (!result) continue
      const { line: parsed, priced } = result
      if (priced && RECEIPT_TOTAL_RE.test(parsed.name)) continue
      if (prev && !parsed.name && parsed.quantity !== null && prev.quantity === null) {
        prev.quantity = parsed.quantity
        prev.unit = parsed.unit
        prev.raw = `${prev.raw}${index > 0 ? ", " : " "}${parsed.raw}`
        continue
      }
      if (index > 0 && prev && isPrepNote(parsed)) continue
      items.push(parsed)
      prev = parsed
    }
  }
  return items
}
