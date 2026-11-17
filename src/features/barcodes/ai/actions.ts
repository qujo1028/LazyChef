"use server"

import { requireViewer } from "@/features/household/queries"
import type { ActionResult } from "@/features/pantry/types"
import { fetchOffProduct, OpenFoodFactsError } from "@/lib/barcode/open-food-facts"
import { normalizeBarcode } from "@/lib/barcode/product"
import { isAiAvailable } from "@/lib/llm/ai"

import type { TidySuggestion } from "./prompt"
import { tidyScannedProduct } from "./tidy"

/**
 * "Tidy name with AI" for a scanned barcode. Only the code comes from the browser: the product is
 * fetched again from Open Food Facts (Next caches it from the lookup), so nothing but its name,
 * brand, categories and size reaches the model.
 */
export async function tidyScannedName(input: string): Promise<ActionResult<{ suggestion: TidySuggestion }>> {
  await requireViewer()
  if (!isAiAvailable()) return { error: "The AI assistant isn't set up." }
  const code = typeof input === "string" ? normalizeBarcode(input.slice(0, 32)) : null
  if (!code) return { error: "That doesn't look like a product barcode." }

  let product
  try {
    product = await fetchOffProduct(code)
  } catch (error) {
    console.warn("[openfoodfacts] lookup failed:", error instanceof OpenFoodFactsError ? error.message : error)
    return { error: "Couldn't look that product up right now. Try again." }
  }
  if (!product)
    return {
      error: "This product isn't in the database. Type a name instead.",
    }

  const result = await tidyScannedProduct(product)
  return result.ok ? { suggestion: result.data } : { error: result.error }
}
