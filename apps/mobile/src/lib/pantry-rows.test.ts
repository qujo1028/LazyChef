import { groupPantry } from '@lazychef/core/pantry/group';
import type { PantryItem } from '@lazychef/core/pantry/types';
import { describe, expect, it } from 'vitest';

import { amountTaken, buildPantryRows } from './pantry-rows';

const base = {
  household_id: 'h',
  unit: 'count',
  category: 'produce',
  expires_on: null,
  is_staple: false,
  quantity: 2,
} as unknown as PantryItem;
const item = (id: string, over: Partial<PantryItem> = {}): PantryItem => ({ ...base, id, name: id, ...over });

const today = '2026-11-18';

describe('buildPantryRows', () => {
  it('lists expiring first, then categories, staples and ran out', () => {
    const sections = groupPantry(
      [
        item('milk', { category: 'dairy', expires_on: '2026-11-19' }),
        item('apple'),
        item('salt', { is_staple: true }),
        item('flour', { quantity: 0 }),
      ],
      today,
    );
    const rows = buildPantryRows(sections, { ranOutOpen: false, searching: false });
    expect(rows.map((r) => r.kind)).toEqual(['heading', 'item', 'heading', 'item', 'heading', 'staples', 'ranOut']);
    expect(rows[0]).toMatchObject({ kind: 'heading', title: 'Expiring soon', first: true });
    expect(rows[2]).toMatchObject({ kind: 'heading', first: false });
  });

  it('marks first and last rows of a card', () => {
    const sections = groupPantry([item('a'), item('b'), item('c')], today);
    const rows = buildPantryRows(sections, { ranOutOpen: false, searching: false }).filter((r) => r.kind === 'item');
    expect(rows.map((r) => r.kind === 'item' && [r.first, r.last])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it('hides ran out items until opened or searching', () => {
    const sections = groupPantry([item('flour', { quantity: 0 })], today);
    expect(buildPantryRows(sections, { ranOutOpen: false, searching: false })).toHaveLength(1);
    const open = buildPantryRows(sections, { ranOutOpen: true, searching: false });
    expect(open).toHaveLength(2);
    expect(open[1]).toMatchObject({ kind: 'item', muted: true });
    const searching = buildPantryRows(sections, { ranOutOpen: false, searching: true });
    expect(searching[0]).toMatchObject({ kind: 'ranOut', expanded: true });
    expect(searching).toHaveLength(2);
  });

  it('is empty for an empty pantry', () => {
    expect(buildPantryRows(groupPantry([], today), { ranOutOpen: false, searching: false })).toEqual([]);
  });
});

describe('amountTaken', () => {
  it('gives back only what was taken', () => {
    expect(amountTaken(5)).toBe(1);
    expect(amountTaken(0.5)).toBe(0.5);
    expect(amountTaken(0)).toBe(0);
    expect(amountTaken(null)).toBe(0);
  });
});
