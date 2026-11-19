import type { ScanHit } from '@lazychef/core/barcodes/types';
import { describe, expect, it } from 'vitest';

import {
  addLooking,
  isLooking,
  nameMissing,
  removeRow,
  replaceRow,
  reviewLabel,
  rowFromAnswer,
  scannedLines,
  type ScanRow,
} from './scan-rows';

const hit = (code: string, line: string): ScanHit => ({
  code,
  source: 'openfoodfacts',
  name: 'eggs',
  quantity: 12,
  unit: 'count',
  label: 'Large eggs',
  line,
});

describe('rowFromAnswer', () => {
  it('maps the three answers', () => {
    expect(rowFromAnswer(1, 'a', { error: 'no' })).toEqual({ key: 1, code: 'a', status: 'error', message: 'no' });
    expect(rowFromAnswer(1, 'a', { found: false, code: 'a' })).toEqual({ key: 1, code: 'a', status: 'missing' });
    expect(rowFromAnswer(1, 'a', { found: true, hit: hit('a', '12 eggs') })).toMatchObject({ status: 'found' });
  });
});

describe('rows', () => {
  it('puts new scans first and replaces and removes by key', () => {
    let rows: ScanRow[] = addLooking([], 1, 'a');
    rows = addLooking(rows, 2, 'b');
    expect(rows.map((r) => r.key)).toEqual([2, 1]);
    expect(isLooking(rows)).toBe(true);
    rows = replaceRow(rows, rowFromAnswer(2, 'b', { found: false, code: 'b' }));
    expect(rows[0].status).toBe('missing');
    expect(removeRow(rows, 2).map((r) => r.key)).toEqual([1]);
  });
});

describe('nameMissing', () => {
  it('cleans the typed name into a found row', () => {
    const row = nameMissing(3, 'c', '  Oat Milk, ');
    expect(row).toMatchObject({ status: 'found', hit: { name: 'oat milk', line: 'oat milk', unit: 'count', quantity: null } });
  });
  it('rejects an empty name', () => {
    expect(nameMissing(3, 'c', ' , ')).toBeNull();
  });
});

describe('scannedLines', () => {
  it('keeps only found rows, oldest first', () => {
    let rows: ScanRow[] = [];
    rows = addLooking(rows, 1, 'a');
    rows = addLooking(rows, 2, 'b');
    rows = addLooking(rows, 3, 'c');
    rows = replaceRow(rows, rowFromAnswer(1, 'a', { found: true, hit: hit('a', '12 eggs') }));
    rows = replaceRow(rows, rowFromAnswer(3, 'c', { found: true, hit: hit('c', '1 gallon milk') }));
    expect(scannedLines(rows).map((l) => l.line)).toEqual(['12 eggs', '1 gallon milk']);
  });
});

describe('reviewLabel', () => {
  it('reads plainly', () => {
    expect(reviewLabel(0)).toBe('Scan something first');
    expect(reviewLabel(1)).toBe('Review 1 item');
    expect(reviewLabel(4)).toBe('Review 4 items');
  });
});
