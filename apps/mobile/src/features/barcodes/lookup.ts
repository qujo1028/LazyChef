// The barcode data layer. The household's own name first (household_barcodes, read as the user
// under RLS), then Open Food Facts called straight from the phone (public, no key). Neither
// function throws. Ported from the web's src/features/barcodes/{actions,server}.ts.
import { onlineManager } from '@tanstack/react-query';
import { normalizeBarcode, productToScan, scanLine } from '@lazychef/core/barcodes/product';
import { barcodeMemoriesSchema } from '@lazychef/core/barcodes/schemas';
import type { BarcodeMemory, LookupResult } from '@lazychef/core/barcodes/types';

import { createLookupCache } from '@/lib/barcode-cache';
import { planBarcodeWrites } from '@/lib/barcode-memory';
import { fetchOffProduct, OpenFoodFactsError } from '@/lib/barcode-off';
import { supabase } from '@/lib/supabase';

export type LookupOutcome = LookupResult | { error: string };

const BAD_CODE = "That doesn't look like a product barcode. Check the numbers under the bars.";
const FAILED = "Couldn't look that up right now. Type it in instead.";
const OFFLINE = "You're offline. Type it in instead.";

const cache = createLookupCache<LookupResult>();

/** What a scanned or typed barcode is. `input` is raw (from the camera or typed); it's normalized here. */
export async function lookupBarcode(householdId: string, input: string): Promise<LookupOutcome> {
  try {
    const code = typeof input === 'string' ? normalizeBarcode(input.slice(0, 32)) : null;
    if (!code) return { error: BAD_CODE };

    const cached = cache.get(householdId, code);
    if (cached) return cached;

    const { data: known, error } = await supabase
      .from('household_barcodes')
      .select('name, quantity, unit')
      .eq('household_id', householdId)
      .eq('code', code)
      .maybeSingle();
    if (error) console.warn('Reading household barcodes failed:', error.code ?? '');
    if (known) {
      const scan = { name: known.name, quantity: known.quantity === null ? null : Number(known.quantity), unit: known.unit };
      const result: LookupResult = { found: true, hit: { code, source: 'household', ...scan, label: known.name, line: scanLine(scan) } };
      cache.set(householdId, code, result);
      return result;
    }

    if (!onlineManager.isOnline()) return { error: OFFLINE };
    const product = await fetchOffProduct(code);
    const scan = product ? productToScan(product) : null;
    const result: LookupResult = scan
      ? { found: true, hit: { code, source: 'openfoodfacts', ...scan, line: scanLine(scan) } }
      : { found: false, code };
    cache.set(householdId, code, result);
    return result;
  } catch (error) {
    console.warn('[barcode] lookup failed:', error instanceof OpenFoodFactsError ? error.message : 'unexpected error');
    return { error: FAILED };
  }
}

/** Remembers what the household calls these codes, after their items are added. Never fails the caller. */
export async function rememberBarcodes(householdId: string, rows: readonly BarcodeMemory[]): Promise<void> {
  try {
    const parsed = barcodeMemoriesSchema.safeParse(rows);
    if (!parsed.success || parsed.data.length === 0) return;
    const codes = [...new Set(parsed.data.map((row) => row.code))];

    const { data: known, error: readError } = await supabase
      .from('household_barcodes')
      .select('code')
      .eq('household_id', householdId)
      .in('code', codes);
    if (readError) {
      console.warn('Remembering barcodes failed:', readError.code ?? '');
      return;
    }
    // Last one wins when the same code shows up twice (planBarcodeWrites dedupes).
    const plan = planBarcodeWrites(householdId, parsed.data, new Set(known.map((row) => row.code)));

    const writes = [
      plan.inserts.length > 0 ? supabase.from('household_barcodes').insert(plan.inserts) : null,
      ...plan.updates.map(({ code, ...fields }) =>
        supabase.from('household_barcodes').update(fields).eq('household_id', householdId).eq('code', code),
      ),
    ];
    for (const result of await Promise.all(writes.filter((write) => write !== null))) {
      // 23505: a housemate saved the same code a moment ago; theirs stands.
      if (result.error && result.error.code !== '23505') console.warn('Remembering barcodes failed:', result.error.code ?? '');
    }
    // The names changed, so a cached lookup for these codes is stale.
    for (const code of codes) cache.delete(householdId, code);
  } catch {
    console.warn('Remembering barcodes failed.');
  }
}
