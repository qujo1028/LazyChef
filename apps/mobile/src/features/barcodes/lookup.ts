// The barcode data layer. The household's own name first (household_barcodes, read as the user
// under RLS), then Open Food Facts called straight from the phone (public, no key). Neither
// function throws. Ported from the web's src/features/barcodes/{actions,server}.ts.
import { onlineManager } from '@tanstack/react-query';
import { normalizeBarcode, productToScan, scanLine } from '@lazychef/core/barcodes/product';
import { barcodeMemorySchema } from '@lazychef/core/barcodes/schemas';
import type { BarcodeMemory, LookupResult } from '@lazychef/core/barcodes/types';

import { createLookupCache } from '@/lib/barcode-cache';
import { planBarcodeWrites } from '@/lib/barcode-memory';
import { fetchOffProduct } from '@/lib/barcode-off';
import { supabase } from '@/lib/supabase';

export type LookupOutcome = LookupResult | { error: string };

const BAD_CODE = "That doesn't look like a product barcode. Check the numbers under the bars.";
const FAILED = "Couldn't look that up right now. Type it in instead.";
const OFFLINE = "You're offline. Type it in instead.";

const cache = createLookupCache<LookupResult>();
// Lookups in flight, so a camera that sees the same code several times asks once.
const inFlight = new Map<string, Promise<LookupOutcome>>();

/** What a scanned or typed barcode is. `input` is raw (from the camera or typed); it's normalized here. */
export async function lookupBarcode(householdId: string, input: string): Promise<LookupOutcome> {
  const code = typeof input === 'string' && input.length <= 32 ? normalizeBarcode(input) : null;
  if (!code) return { error: BAD_CODE };
  const cached = cache.get(householdId, code);
  if (cached) return cached;
  const key = `${householdId}:${code}`;
  const pending = inFlight.get(key) ?? resolveCode(householdId, code).finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}

async function resolveCode(householdId: string, code: string): Promise<LookupOutcome> {
  try {
    const { data: known, error } = await supabase
      .from('household_barcodes')
      .select('name, quantity, unit')
      .eq('household_id', householdId)
      .eq('code', code)
      .maybeSingle();
    // Don't guess from Open Food Facts when the household's own names couldn't be read.
    if (error) {
      console.warn('Reading household barcodes failed:', error.code ?? '');
      return { error: FAILED };
    }
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
    // "Not found" isn't cached, so a name a housemate saves later shows on the next scan.
    if (result.found) cache.set(householdId, code, result);
    return result;
  } catch (error) {
    console.warn('[barcode] lookup failed:', error instanceof Error ? `${error.name}: ${error.message}` : 'unexpected error');
    return { error: FAILED };
  }
}

/** Remembers what the household calls these codes, after their items are added. Never fails the caller. */
export async function rememberBarcodes(householdId: string, rows: readonly BarcodeMemory[]): Promise<void> {
  const codes: string[] = [];
  try {
    // One bad row shouldn't cost the others.
    const valid = rows.slice(0, 100).flatMap((row) => {
      const parsed = barcodeMemorySchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
    if (valid.length < rows.length) console.warn(`Skipped ${rows.length - valid.length} invalid barcode rows.`);
    if (valid.length === 0) return;
    codes.push(...new Set(valid.map((row) => row.code)));

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
    const plan = planBarcodeWrites(householdId, valid, new Set(known.map((row) => row.code)));

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
  } catch {
    console.warn('Remembering barcodes failed.');
  } finally {
    // The names changed, so a cached lookup for these codes is stale.
    for (const code of codes) cache.delete(householdId, code);
  }
}
