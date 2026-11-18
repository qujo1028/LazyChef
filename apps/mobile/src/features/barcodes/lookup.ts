// STUB (P5 step 0). W4 builds the barcode data layer, ported from the web's
// src/features/barcodes/actions.ts, server.ts and src/lib/barcode/open-food-facts.ts:
// the household's own name first (household_barcodes, read as the user under RLS), then
// Open Food Facts called straight from the phone (public, no key). Neither function throws.
// Keep these signatures; W3's scanner calls them.
import type { BarcodeMemory, LookupResult } from '@lazychef/core/barcodes/types';

export type LookupOutcome = LookupResult | { error: string };

/** What a scanned or typed barcode is. `input` is raw (from the camera or typed); it's normalized here. */
export async function lookupBarcode(householdId: string, input: string): Promise<LookupOutcome> {
  void householdId;
  void input;
  return { error: "Couldn't look that up right now. Type it in instead." };
}

/** Remembers what the household calls these codes, after their items are added. Never fails the caller. */
export async function rememberBarcodes(householdId: string, rows: readonly BarcodeMemory[]): Promise<void> {
  void householdId;
  void rows;
}
