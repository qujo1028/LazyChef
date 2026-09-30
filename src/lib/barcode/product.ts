// Pure: the products behind barcodes. Turns an Open Food Facts product ("Kirkland Signature Large Brown Eggs", "24 ct")
// into a pantry line ("24 eggs") the usual add-food review understands.
import { findIngredient, normalizeIngredientName } from "@/lib/ingredients/catalog"
import type { CatalogEntry } from "@/lib/ingredients/types"
import { parseLine } from "@/lib/ingredients/parse-line"
import { formatQuantity } from "@/lib/units"

export { expandUpcE, normalizeBarcode } from "./codes"

// ── Products ─────────────────────────────────────────────────────────────────

/** The Open Food Facts fields we ask for. */
export type OffProduct = {
  product_name?: string
  product_name_en?: string
  generic_name?: string
  generic_name_en?: string
  brands?: string
  quantity?: string
  categories_tags?: string[]
}

/** What a scan adds: a pantry name and one package's amount. */
export type ScannedProduct = {
  /** Lowercase pantry name: "eggs". */
  name: string
  /** One package: 24, 1, 500. null when the package doesn't say. */
  quantity: number | null
  /** Canonical unit key: "count", "gal", "g". */
  unit: string
  /** The product as printed, for the scan list: "Kirkland Signature Large Brown Eggs". */
  label: string
}

const MAX_NAME = 80

function words(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[,;•|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Drops the brand ("Kirkland Signature …") and any size printed in the name ("… 24 ct"). */
function cleanProductName(name: string, brands: string | undefined): string {
  let text = ` ${words(name)} `
  for (const brand of (brands ?? "").split(",").map(words).filter(Boolean)) {
    text = text.split(` ${brand} `).join(" ")
  }
  text = text.replace(/\s\d+(?:[.,]\d+)?\s*(?:ct|count|pk|pack|oz|fl oz|lb|lbs|g|kg|ml|l|gal)\b\.?/g, " ")
  // When the brand is the product ("Cheerios" by Cheerios), keep it.
  return text.replace(/\s+/g, " ").trim() || words(name)
}

/** "en:whole-milks" → "whole milks". Most specific (last) first; other languages skipped. */
function categoryNames(tags: readonly string[] | undefined): string[] {
  return [...(tags ?? [])]
    .reverse()
    .filter((tag) => tag.startsWith("en:"))
    .map((tag) => tag.slice(3).replace(/-/g, " "))
}

/** "24 ct" → 24 count, "1 gal (3.78 L)" → 1 gal, "2 x 200 g" → 400 g. */
export function packageSize(quantity: string | undefined): { quantity: number | null; unit: string } {
  // Parentheses ("(3.78 L)") and the EU "estimated" mark ("400 g e", "400 g ℮") aside.
  const text = (quantity ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s(?:e|℮)\s*$/i, "")
    .trim()
  if (!text) return { quantity: null, unit: "count" }
  const line = parseLine(`${text} x`)
  if (!line || line.quantity === null || line.name !== "x") return { quantity: null, unit: "count" }
  return { quantity: line.quantity, unit: line.unit }
}

/**
 * The library's entry for a product name, only when the entry's name (or an alias) is in
 * the product name and includes its last word, where English puts the thing itself:
 * "large brown eggs" → eggs, but "zesty ranch crunchers" isn't ranch dressing, however
 * close the fuzzy match thinks it is.
 */
function libraryMatch(candidate: string): CatalogEntry | null {
  const entry = findIngredient(candidate)
  if (!entry) return null
  const have = normalizeIngredientName(candidate).split(" ")
  const head = have.at(-1)
  const fits = (name: string) => {
    const want = normalizeIngredientName(name).split(" ")
    return want.every((word) => have.includes(word)) && head !== undefined && want.includes(head)
  }
  return [entry.name, ...entry.aliases].some(fits) ? entry : null
}

/**
 * The pantry version of a product: the ingredient library's name when any of the
 * product's names or categories match ("Kirkland Signature Large Brown Eggs" → "eggs"),
 * otherwise the product name without the brand. null when the product has no name at all.
 */
export function productToScan(product: OffProduct): ScannedProduct | null {
  // The name on the package first: the English field is sometimes something else entirely
  // (Cheerios' says "My Bff"). Every name is still tried against the library.
  const printed = [product.product_name, product.product_name_en, product.generic_name_en, product.generic_name]
    .map((name) => (name ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
  const cleaned = printed.map((name) => cleanProductName(name, product.brands)).filter(Boolean)

  let name: string | null = null
  for (const candidate of [...cleaned, ...categoryNames(product.categories_tags)]) {
    const entry = libraryMatch(candidate)
    if (entry) {
      name = entry.name
      break
    }
  }
  name ??= cleaned[0] ?? null
  if (!name) return null

  const brand = (product.brands ?? "").split(",")[0]?.trim()
  const label = printed[0] ?? name
  return {
    name: name.slice(0, MAX_NAME),
    ...packageSize(product.quantity),
    label: brand && !label.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${label}` : label,
  }
}

/**
 * The line a scan adds to the add-food box: "24 eggs", "1 gal whole milk", "spaghetti".
 * Commas and semicolons are dropped from the name so it stays one line.
 */
export function scanLine(scan: Pick<ScannedProduct, "name" | "quantity" | "unit">): string {
  const name = scan.name.replace(/[,;•]+/g, " ").replace(/\s+/g, " ").trim()
  return scan.quantity === null ? name : `${formatQuantity(scan.quantity, scan.unit)} ${name}`
}
