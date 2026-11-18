// Splits barcode memories into new codes (insert) and known ones (update). Members may only change a
// code's name and amount, so an upsert won't do. Same rules as the web's server.ts.
import type { BarcodeMemory } from '@lazychef/core/barcodes/types';

export type BarcodeWritePlan = {
  inserts: { household_id: string; code: string; name: string; quantity: number | null; unit: string }[];
  updates: { code: string; name: string; quantity: number | null; unit: string }[];
};

/** Last row wins per code. Names are lowercased. */
export function dedupeBarcodes(rows: readonly BarcodeMemory[]): BarcodeMemory[] {
  const byCode = new Map(rows.map((row) => [row.code, { ...row, name: row.name.toLowerCase() }]));
  return [...byCode.values()];
}

/** `known` is the set of codes the household already has. */
export function planBarcodeWrites(householdId: string, rows: readonly BarcodeMemory[], known: ReadonlySet<string>): BarcodeWritePlan {
  const plan: BarcodeWritePlan = { inserts: [], updates: [] };
  for (const { code, name, quantity, unit } of dedupeBarcodes(rows)) {
    if (known.has(code)) plan.updates.push({ code, name, quantity, unit });
    else plan.inserts.push({ household_id: householdId, code, name, quantity, unit });
  }
  return plan;
}
