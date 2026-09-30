/** What one scan turned out to be. */
export type ScanHit = {
  /** Normalized barcode. */
  code: string
  /** The household named it before, or it came from Open Food Facts. */
  source: "household" | "openfoodfacts"
  /** Pantry name: "eggs". */
  name: string
  quantity: number | null
  unit: string
  /** For the scan list: "Kirkland Signature Large Brown Eggs". */
  label: string
  /** The add-food line: "24 eggs". */
  line: string
}

export type LookupResult = { found: true; hit: ScanHit } | { found: false; code: string }

/** A barcode to remember after its item is added, named the way the household left it. */
export type BarcodeMemory = { code: string; name: string; quantity: number | null; unit: string }
