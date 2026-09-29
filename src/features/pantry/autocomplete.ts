// Pure helpers for the add-food input: autocomplete works on the item being typed
// right now, i.e. the text after the last newline, comma or semicolon.

const SEPARATOR = /[\n,;]/

/** The item currently being typed (untrimmed) and where it starts in `text`. */
export function currentSegment(text: string): { start: number; segment: string } {
  let start = text.length
  while (start > 0 && !SEPARATOR.test(text[start - 1])) start--
  return { start, segment: text.slice(start) }
}

/**
 * Swaps the name of the item being typed for a picked suggestion, keeping the typed
 * amount: ("milk, 2 lbs chi", "2 lbs ", "chicken breast") → "milk, 2 lbs chicken breast".
 */
export function replaceCurrentName(text: string, amountText: string, name: string): string {
  const { start, segment } = currentSegment(text)
  const lead = /^\s*/.exec(segment)?.[0] ?? ""
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
