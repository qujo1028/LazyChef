// Pure: the serving scaler. Scales a recipe line's displayed amount and the cook-mode
// deductions by (chosen servings / recipe servings).
import { roundQuantity } from "@/features/pantry/merge"
import { formatQuantity, normalizeUnit } from "@/lib/units"

import type { CookLine } from "./cook"

export const MIN_SERVINGS = 1
export const MAX_SERVINGS = 48

export function clampServings(servings: number): number {
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(servings)))
}

/** chosen / base; 1 when the recipe doesn't say how many it serves. */
export function scaleFactor(servings: number, base: number | null): number {
  if (base === null || !(base > 0) || !(servings > 0)) return 1
  return servings / base
}

const GLYPHS: Record<string, number> = {
  "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8,
}
const GLYPH_CLASS = Object.keys(GLYPHS).join("")
const NUM = `(?:\\d+[ ]*[${GLYPH_CLASS}]|[${GLYPH_CLASS}]|\\d+[ ]+\\d+/\\d+|\\d+/\\d+|\\d*\\.\\d+|\\d+)`
// "2 cups", "1-2 tbsp", "1 1/2 lb"; the unit word is optional.
const LEAD_RE = new RegExp(`^(\\s*)(${NUM})(?:\\s*[-–]\\s*(${NUM}))?(?:(\\s+)([A-Za-z]+\\.?))?`)

function parseNum(text: string): number {
  const t = text.trim()
  const glyph = new RegExp(`^(?:(\\d+)[ ]*)?([${GLYPH_CLASS}])$`).exec(t)
  if (glyph) return Number(glyph[1] ?? 0) + GLYPHS[glyph[2]]
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = /^(\d+)\/(\d+)$/.exec(t)
  if (frac) return Number(frac[1]) / Number(frac[2])
  return Number(t)
}

/**
 * Scales the leading amount of a recipe line: "1 1/2 cups flour, sifted" ×2 → "3 cups flour, sifted".
 * Ranges scale both ends. Lines with no leading number ("salt to taste") come back as they were.
 */
export function scaleOriginal(original: string, factor: number): string {
  if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return original
  const match = LEAD_RE.exec(original)
  if (!match) return original
  const [whole, lead, first, second, gap, word] = match
  const a = parseNum(first)
  const b = second === undefined ? null : parseNum(second)
  if (!Number.isFinite(a) || (b !== null && !Number.isFinite(b))) return original
  const unit = word ? normalizeUnit(word.replace(/\.$/, "")) : null
  const fmt = (n: number) => formatQuantity(n, "count") || String(roundQuantity(n))
  const unitFor = (n: number) => (unit && unit !== "count" ? formatQuantity(n, unit).replace(/^[^\sA-Za-z]*[\d.½⅓⅔¼¾⅛⅜⅝⅞/]+\s*/, "") : "")
  const top = b ?? a
  const amount = b === null ? fmt(a * factor) : `${fmt(a * factor)}–${fmt(b * factor)}`
  const unitText = unit && unit !== "count" ? unitFor(top * factor) || word : null
  const rest = original.slice(whole.length)
  if (unitText) return `${lead}${amount}${gap}${unitText}${rest}`
  return `${lead}${amount}${gap ?? ""}${word ?? ""}${rest}`
}

/** Cook-mode lines with deductions scaled. "check" lines have no amount, so they stay as they are. */
export function scaleCookLines(lines: readonly CookLine[], factor: number): CookLine[] {
  if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return [...lines]
  return lines.map((line) => (line.kind === "deduct" ? { ...line, amount: roundQuantity(line.amount * factor) } : line))
}
