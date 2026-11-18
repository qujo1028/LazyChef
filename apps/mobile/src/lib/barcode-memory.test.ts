import { describe, expect, it } from 'vitest';

import { dedupeBarcodes, planBarcodeWrites } from './barcode-memory';

const row = (code: string, name: string, quantity: number | null = 1, unit = 'each') => ({ code, name, quantity, unit });

describe('dedupeBarcodes', () => {
  it('keeps the last row per code and lowercases names', () => {
    expect(dedupeBarcodes([row('11111111', 'Eggs'), row('22222222', 'Milk'), row('11111111', 'Large EGGS', 12)])).toEqual([
      row('11111111', 'large eggs', 12),
      row('22222222', 'milk'),
    ]);
  });
});

describe('planBarcodeWrites', () => {
  it('inserts new codes with the household and updates known ones with only name, amount and unit', () => {
    const plan = planBarcodeWrites('h1', [row('11111111', 'Eggs'), row('22222222', 'Milk', null, 'l')], new Set(['22222222']));
    expect(plan.inserts).toEqual([{ household_id: 'h1', ...row('11111111', 'eggs') }]);
    expect(plan.updates).toEqual([row('22222222', 'milk', null, 'l')]);
  });

  it('plans nothing for no rows', () => {
    expect(planBarcodeWrites('h1', [], new Set())).toEqual({ inserts: [], updates: [] });
  });
});
