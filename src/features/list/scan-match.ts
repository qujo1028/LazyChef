// Pure: which shopping list line a scanned product is.
import { normalizeIngredientName } from "@/lib/ingredients/library/normalize"

type Line = { id: string; name: string; checked_at: string | null }

/**
 * The unchecked line a scanned product checks off, or null. Same name first; then a line
 * whose words are all in the product's ("milk" for "whole milk"), the most specific one;
 * then a product whose words are all in a line's ("eggs" for "brown eggs").
 */
export function findListLine<T extends Line>(items: Iterable<T>, scannedName: string): T | null {
  const scanned = normalizeIngredientName(scannedName)
  if (!scanned) return null
  const scannedWords = new Set(scanned.split(" "))
  let broader: { item: T; size: number } | null = null
  let narrower: { item: T; size: number } | null = null
  for (const item of items) {
    if (item.checked_at !== null) continue
    const key = normalizeIngredientName(item.name)
    if (!key) continue
    if (key === scanned) return item
    const words = key.split(" ")
    if (words.every((word) => scannedWords.has(word))) {
      if (!broader || words.length > broader.size) broader = { item, size: words.length }
    } else if ([...scannedWords].every((word) => words.includes(word))) {
      if (!narrower || words.length < narrower.size) narrower = { item, size: words.length }
    }
  }
  return broader?.item ?? narrower?.item ?? null
}
