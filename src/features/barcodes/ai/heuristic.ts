// Pure: whether a scanned product's name looks messy enough to offer "Tidy name with AI".
// Only these scans get the button, so the AI quota isn't spent on names that are fine already.
import { findIngredient } from "@/lib/ingredients/catalog"

export type MessyInput = {
  /** The pantry name the scan would add, lowercase: "krft mac&chs orig". */
  name: string
  /** The product as printed: "KRFT MAC&CHS ORIG 7.25OZ". */
  printed: string
  /** Open Food Facts' brands field: "Kraft, Kraft Heinz". */
  brands?: string
}

const SIZE = /\d+(?:[.,]\d+)?\s*(?:ct|count|pk|pack|oz|fl\s?oz|lbs?|g|kg|ml|l|gal|qt|pt)\b/i
const VOWELS = /[aeiouy]/

/** True when the name is shouting, abbreviated, too long, or still carries a brand or size. */
export function looksMessy({ name, printed, brands }: MessyInput): boolean {
  const clean = name.trim().toLowerCase()
  if (!clean) return false
  // The scan already landed on a library ingredient ("eggs"): nothing to tidy.
  if (findIngredient(clean)?.name === clean) return false

  // ALL CAPS: most letters upper case (ignoring short names like "BBQ").
  const letters = printed.replace(/[^a-z]/gi, "")
  const upper = letters.replace(/[^A-Z]/g, "").length
  if (letters.length >= 6 && upper / letters.length >= 0.7) return true

  // A size printed in the name ("7.25OZ"), or any digits left in the pantry name.
  if (SIZE.test(printed) || /\d/.test(clean)) return true

  const words = clean.split(/\s+/)
  // Abbreviations: "mac&chs", "orig.", "krft", "w/".
  if (/\w&\w/.test(clean) || /\b\w{2,5}\.(?=\s|$)/.test(printed) || /\bw\//i.test(printed)) return true
  if (words.some((word) => /^[a-z]{3,}$/.test(word) && !VOWELS.test(word))) return true

  // Long marketing names: "original flavor macaroni and cheese dinner family size".
  if (words.length > 5 || clean.length > 40) return true

  // A brand word still in the name ("kraft macaroni" when brands is "Kraft Heinz"), unless the
  // brand is the product ("cheerios" by Cheerios).
  const brandWords = new Set(
    (brands ?? "")
      .toLowerCase()
      .split(/[,\s]+/)
      .filter((word) => word.length >= 3),
  )
  const branded = words.filter((word) => brandWords.has(word)).length
  return branded > 0 && branded < words.length
}
