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
