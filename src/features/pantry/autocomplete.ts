// Pure helpers for the add-food input: autocomplete works on the item being typed
// right now, i.e. the text after the last separator that parseLines splits on (a line
// break, semicolon, inline bullet, or a comma that isn't inside "1,000" or parentheses).
import { parseLine } from "@/lib/ingredients/parse-line"

const LINE_BREAK = /[\r\n\v\f\u0085\u2028\u2029]/

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9"
}

/**
 * Where the last item of `line` starts, splitting the way parseLines does: on ";", "•" and
 * commas not between digits ("1,000") or inside parentheses. An unclosed "(" would hide every
 * later comma, so then (like parseLines) the parentheses are ignored.
 */
function lastItemStart(line: string, parens = true): number {
  let depth = 0
  let start = 0
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (parens && c === "(") depth++
    else if (parens && c === ")") depth = Math.max(0, depth - 1)
    else if (depth === 0 && (c === ";" || c === "•" || (c === "," && !(isDigit(line[i - 1]) && isDigit(line[i + 1]))))) {
      start = i + 1
    }
  }
  return depth > 0 ? lastItemStart(line, false) : start
}

/** The item currently being typed (untrimmed) and where it starts in `text`. */
export function currentSegment(text: string): { start: number; segment: string } {
  let lineStart = text.length
  while (lineStart > 0 && !LINE_BREAK.test(text[lineStart - 1])) lineStart--
  const start = lineStart + lastItemStart(text.slice(lineStart))
  return { start, segment: text.slice(start) }
}

/** Spaces parseLine turns into " ", one for one (so indexes still line up). */
const ODD_SPACE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\f\v]/g

/**
 * Swaps the name of the item being typed for a picked suggestion, keeping the typed
 * amount and anything before it (spaces, a list marker): ("milk, 2 lbs chi", "2 lbs ",
 * "chicken breast") → "milk, 2 lbs chicken breast"; ("- 2 lbs chi", …) → "- 2 lbs chicken breast".
 */
export function replaceCurrentName(text: string, amountText: string, name: string): string {
  const { start, segment } = currentSegment(text)
  // parseLine's raw is the segment without leading spaces and list marker, so what's in front of
  // it is kept as is. amountText is the start of raw.
  const body = segment.replace(ODD_SPACE, " ").trimEnd()
  const raw = parseLine(segment)?.raw
  const lead =
    raw && body.endsWith(raw) && raw.startsWith(amountText)
      ? segment.slice(0, body.length - raw.length)
      : (/^\s*/.exec(segment)?.[0] ?? "")
  return text.slice(0, start) + lead + amountText + name
}

/** "- ", "* ", "• ", "1. ", "2) ", "[ ] ", "[x] " at the start of a pasted line. */
const LIST_MARKER = /^(?:[-*•·]|\d{1,3}[.)]|\[[ xX]?\])\s+/

/**
 * Pasting a multi-line list into the one-line add box: the lines become comma-separated
 * items at the selection. null for a single line (let the browser paste it).
 * ("milk", 4, 4, "eggs\n2 lbs chicken\n") → { text: "milk, eggs, 2 lbs chicken", caret: 25 }.
 */
export function insertPastedLines(
  text: string,
  start: number,
  end: number,
  pasted: string,
): { text: string; caret: number } | null {
  if (!/[\r\n\u2028]/.test(pasted)) return null
  const lines = pasted
    .split(/\r\n?|\n|\u2028/)
    .map((line) => line.trim().replace(LIST_MARKER, ""))
    .filter(Boolean)
  const before = text.slice(0, start)
  const after = text.slice(end)
  const joined = lines.join(", ")
  let lead = ""
  if (before.trim() && !/[,;]\s*$/.test(before)) lead = ", "
  else if (before && !/\s$/.test(before)) lead = " "
  const rest = after.trim() && !/^\s*[,;]/.test(after) ? `, ${after.trimStart()}` : after
  const inserted = before + lead + joined
  return { text: inserted + rest, caret: inserted.length }
}
