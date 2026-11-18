// Open Food Facts from the phone: public and keyless. Pure apart from `fetch`, so it can be tested
// with a mock. Ported from src/lib/barcode/open-food-facts.ts. Its data is under the Open Database
// License, so the scanner credits it.
import type { OffProduct } from '@lazychef/core/barcodes/product';

const FIELDS = ['product_name', 'product_name_en', 'generic_name', 'generic_name_en', 'brands', 'quantity', 'categories_tags'];
export const OFF_TIMEOUT_MS = 6000;
// They ask every app to identify itself.
const USER_AGENT = 'LazyChef/1.0 (https://lazychef-gamma.vercel.app)';

export class OpenFoodFactsError extends Error {}

/** The product for a normalized barcode, or null if Open Food Facts doesn't know it. Throws OpenFoodFactsError on trouble. */
export async function fetchOffProduct(code: string): Promise<OffProduct | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS.join(',')}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new OpenFoodFactsError(`HTTP ${response.status}`);
    const body = (await response.json().catch(() => null)) as unknown;
    return parseOffBody(body);
  } catch (error) {
    if (error instanceof OpenFoodFactsError) throw error;
    throw new OpenFoodFactsError(error instanceof Error ? error.message : 'request failed');
  } finally {
    clearTimeout(timer);
  }
}

/** status 1 with a product object is a hit; anything else is "not found". */
export function parseOffBody(body: unknown): OffProduct | null {
  if (!body || typeof body !== 'object') return null;
  const { status, product } = body as { status?: unknown; product?: unknown };
  if (status !== 1 || !product || typeof product !== 'object') return null;
  return product as OffProduct;
}
