// Pure: the scan list in the Add food sheet. One row per scan (two cartons of eggs are two rows),
// newest first. Ported from the web's use-barcode-lookups.ts and scan-to-add-sheet.tsx.
import { cleanScanName } from '@lazychef/core/barcodes/product';
import type { LookupResult, ScanHit } from '@lazychef/core/barcodes/types';

export type ScanRow =
  | { key: number; code: string; status: 'looking' }
  | { key: number; code: string; status: 'found'; hit: ScanHit }
  | { key: number; code: string; status: 'missing' }
  | { key: number; code: string; status: 'error'; message: string };

/** What `lookupBarcode` can answer. */
export type LookupAnswer = LookupResult | { error: string };

export function rowFromAnswer(key: number, code: string, answer: LookupAnswer): ScanRow {
  if ('error' in answer) return { key, code, status: 'error', message: answer.error };
  if (answer.found) return { key, code, status: 'found', hit: answer.hit };
  return { key, code, status: 'missing' };
}

/** A new scan goes on top. */
export function addLooking(rows: readonly ScanRow[], key: number, code: string): ScanRow[] {
  return [{ key, code, status: 'looking' }, ...rows];
}

export function replaceRow(rows: readonly ScanRow[], row: ScanRow): ScanRow[] {
  return rows.map((r) => (r.key === row.key ? row : r));
}

export function removeRow(rows: readonly ScanRow[], key: number): ScanRow[] {
  return rows.filter((r) => r.key !== key);
}

/** A code the database didn't know, named by hand. Null when the name is empty once cleaned. */
export function nameMissing(key: number, code: string, typed: string): ScanRow | null {
  const clean = cleanScanName(typed);
  if (!clean) return null;
  const hit: ScanHit = { code, source: 'household', name: clean, quantity: null, unit: 'count', label: clean, line: clean };
  return { key, code, status: 'found', hit };
}

export function isLooking(rows: readonly ScanRow[]): boolean {
  return rows.some((r) => r.status === 'looking');
}

/** A scanned item headed for the add-food box. */
export type ScannedLine = { code: string; line: string; quantity: number | null; unit: string };

/** The found scans, oldest first (the order they came out of the bag). */
export function scannedLines(rows: readonly ScanRow[]): ScannedLine[] {
  const lines: ScannedLine[] = [];
  for (const row of rows) {
    if (row.status === 'found') {
      lines.unshift({ code: row.hit.code, line: row.hit.line, quantity: row.hit.quantity, unit: row.hit.unit });
    }
  }
  return lines;
}

export function reviewLabel(found: number): string {
  if (found === 0) return 'Scan something first';
  return found === 1 ? 'Review 1 item' : `Review ${found} items`;
}
