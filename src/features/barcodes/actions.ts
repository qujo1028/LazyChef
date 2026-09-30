"use server"

import { requireHousehold } from "@/features/household/queries"
import type { ActionResult } from "@/features/pantry/types"
import { fetchOffProduct, OpenFoodFactsError } from "@/lib/barcode/open-food-facts"
import { normalizeBarcode, productToScan, scanLine } from "@/lib/barcode/product"
import { createClient } from "@/lib/supabase/server"

import { barcodeMemorySchema } from "./schemas"
import { rememberBarcodes } from "./server"
import type { BarcodeMemory, LookupResult } from "./types"

/**
 * What a scanned (or typed) barcode is: the household's own name for it if anyone
 * added it before, otherwise Open Food Facts' product, cleaned up for the pantry.
 * Costs no Spoonacular points.
 */
export async function lookupBarcode(input: string): Promise<ActionResult<LookupResult>> {
  const code = typeof input === "string" ? normalizeBarcode(input.slice(0, 32)) : null
  if (!code) return { error: "That doesn't look like a product barcode. Check the numbers under the bars." }

  const { household } = await requireHousehold()
  const supabase = await createClient()
  const { data: known, error } = await supabase
    .from("household_barcodes")
    .select("name, quantity, unit")
    .eq("household_id", household.id)
    .eq("code", code)
    .maybeSingle()
  if (error) console.error("Reading household barcodes failed:", error.code ?? "", error.message)
  if (known) {
    const quantity = known.quantity === null ? null : Number(known.quantity)
    const scan = { name: known.name, quantity, unit: known.unit }
    return { found: true, hit: { code, source: "household", ...scan, label: known.name, line: scanLine(scan) } }
  }

  try {
    const product = await fetchOffProduct(code)
    const scan = product ? productToScan(product) : null
    if (!scan) return { found: false, code }
    return { found: true, hit: { code, source: "openfoodfacts", ...scan, line: scanLine(scan) } }
  } catch (lookupError) {
    console.warn("[openfoodfacts] lookup failed:", lookupError instanceof OpenFoodFactsError ? lookupError.message : lookupError)
    return { error: "Couldn't look that up right now. Type it in instead." }
  }
}

/** Remembers what the household calls a code (a product the database didn't know, named by hand). */
export async function rememberBarcode(memory: BarcodeMemory): Promise<ActionResult> {
  const parsed = barcodeMemorySchema.safeParse(memory)
  const code = parsed.success ? normalizeBarcode(parsed.data.code) : null
  if (!parsed.success || !code) return { error: "Couldn't save that barcode." }
  const { household } = await requireHousehold()
  await rememberBarcodes(await createClient(), household.id, [{ ...parsed.data, code, name: parsed.data.name.toLowerCase() }])
  return {}
}
