import "server-only"

import type { OffProduct } from "./product"

// Open Food Facts: a free, open product database (no key). Its data is under the Open
// Database License, so the scanner credits it. https://openfoodfacts.github.io/openfoodfacts-server/api/

const FIELDS = ["product_name", "product_name_en", "generic_name", "generic_name_en", "brands", "quantity", "categories_tags"]
const TIMEOUT_MS = 6000
// They ask every app to identify itself.
const USER_AGENT = "LazyChef/1.0 (https://lazychef-gamma.vercel.app)"

export class OpenFoodFactsError extends Error {}

/** The product for a normalized barcode, or null if Open Food Facts doesn't know it. */
export async function fetchOffProduct(code: string): Promise<OffProduct | null> {
  let response: Response
  try {
    response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS.join(",")}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Product data barely changes; let Next keep answers for a day.
      next: { revalidate: 86_400 },
    })
  } catch (error) {
    throw new OpenFoodFactsError(error instanceof Error ? error.message : "request failed")
  }
  if (response.status === 404) return null
  if (!response.ok) throw new OpenFoodFactsError(`HTTP ${response.status}`)
  const body = (await response.json().catch(() => null)) as { status?: number; product?: OffProduct } | null
  if (!body || body.status !== 1 || !body.product || typeof body.product !== "object") return null
  return body.product
}
