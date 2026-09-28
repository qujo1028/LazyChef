// OWNER: parser agent. Contract stub — keep these exports and signatures.
// Pure module (no Node/Next APIs); used on both server and client.
import type { ParsedLine } from "./types"

/** "2 lbs chicken breast" → { amountText: "2 lbs ", name: "chicken breast", quantity: 2, unit: "lb" }. null for blank lines. */
export function parseLine(raw: string): ParsedLine | null {
  const text = raw.trim()
  if (!text) return null
  return { raw: text, amountText: "", name: text.toLowerCase(), quantity: null, unit: "count" }
}

/** Splits pasted text into items (newlines, commas, semicolons, bullets) and parses each. */
export function parseLines(text: string): ParsedLine[] {
  return text
    .split(/[\n,;]+/)
    .map(parseLine)
    .filter((line): line is ParsedLine => line !== null)
}
