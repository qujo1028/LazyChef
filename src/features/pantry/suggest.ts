// Pure: autocomplete for the add-food input, for the item at the caret (usually the
// last one, but you can go back and fix an earlier one).
import { parseLine } from "@/lib/ingredients/parse-line"
import { currentSegment, replaceCurrentName } from "./autocomplete"

/** The caret is at the end of an item: only spaces before the next separator (or the end). */
const END_OF_ITEM = /^[ \t]*(?:[\n,;]|$)/

export type SuggestionQuery = {
  /** What's typed of the name so far, as parseLine reads it ("chi"). */
  name: string
  /** The amount typed before it ("2 lbs "), kept when a suggestion is picked. */
  amountText: string
}

/**
 * What to look up for the item at the caret: "milk, 2 lbs chi|" → { name: "chi", amountText: "2 lbs " }.
 * null when there's no name yet, the caret is inside a word, or the amount comes after the
 * name ("milk 2|"), since picking a suggestion would drop it.
 */
export function suggestionQuery(text: string, caret: number): SuggestionQuery | null {
  const at = Math.min(Math.max(caret, 0), text.length)
  if (!END_OF_ITEM.test(text.slice(at))) return null
  const parsed = parseLine(currentSegment(text.slice(0, at)).segment)
  if (!parsed || !parsed.name) return null
  if (!parsed.amountText && parsed.quantity !== null) return null
  return { name: parsed.name, amountText: parsed.amountText }
}

/** Puts a picked name in place of the item at the caret; returns the new text and caret (after the name). */
export function replaceNameAtCaret(
  text: string,
  caret: number,
  amountText: string,
  name: string,
): { text: string; caret: number } {
  const at = Math.min(Math.max(caret, 0), text.length)
  const before = replaceCurrentName(text.slice(0, at), amountText, name)
  return { text: before + text.slice(at), caret: before.length }
}

/** Where `query` appears in `name` (case-insensitive), to bold it in the list. */
export function matchRange(name: string, query: string): [start: number, end: number] | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const start = name.toLowerCase().indexOf(q)
  return start === -1 ? null : [start, start + q.length]
}
