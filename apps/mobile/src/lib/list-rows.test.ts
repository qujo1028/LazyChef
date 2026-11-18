import { groupList } from '@lazychef/core/list/group';
import type { ListItem } from '@lazychef/core/list/types';
import { describe, expect, it } from 'vitest';

import { buildListRows, listMeta, putAwayLabel } from './list-rows';

function line(id: string, name: string, extra: Partial<ListItem> = {}): ListItem {
  return {
    id,
    household_id: 'h',
    name,
    quantity: null,
    unit: null,
    note: null,
    category: 'produce',
    recipe_title: null,
    checked_at: null,
    checked_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...extra,
  } as ListItem;
}

describe('buildListRows', () => {
  it('is empty for an empty list', () => {
    expect(buildListRows(groupList([]))).toEqual([]);
  });

  it('puts a heading before each category and marks first and last', () => {
    const rows = buildListRows(groupList([line('1', 'Apple'), line('2', 'Banana')]));
    expect(rows.map((r) => r.kind)).toEqual(['heading', 'item', 'item']);
    expect(rows[0]).toMatchObject({ first: true, count: 2 });
    expect(rows[1]).toMatchObject({ first: true, last: false, inCart: false });
    expect(rows[2]).toMatchObject({ first: false, last: true });
  });

  it('adds the cart with a put away row', () => {
    const rows = buildListRows(groupList([line('1', 'Apple', { checked_at: '2026-01-02T00:00:00Z' })]));
    expect(rows.map((r) => r.kind)).toEqual(['heading', 'item', 'putAway']);
    expect(rows[0]).toMatchObject({ title: 'In the cart', first: true });
    expect(rows[1]).toMatchObject({ inCart: true });
    expect(rows[2]).toMatchObject({ count: 1 });
  });

  it('only the very first heading is first', () => {
    const rows = buildListRows(
      groupList([line('1', 'Apple'), line('2', 'Milk', { category: 'dairy' }), line('3', 'Rice', { checked_at: '2026-01-02T00:00:00Z' })]),
    );
    expect(rows.filter((r) => r.kind === 'heading').map((r) => (r as { first: boolean }).first)).toEqual([true, false, false]);
  });
});

describe('listMeta', () => {
  it('joins amount, note, recipe and detail', () => {
    expect(listMeta(line('1', 'Lemon', { quantity: 2, note: 'ripe', recipe_title: 'Lemonade' }), 'Checked by you')).toBe(
      '2 · ripe · For Lemonade · Checked by you',
    );
  });
  it('is empty with nothing to say', () => {
    expect(listMeta(line('1', 'Lemon'))).toBe('');
  });
});

describe('putAwayLabel', () => {
  it('pluralizes', () => {
    expect(putAwayLabel(1)).toBe('Put away 1 item');
    expect(putAwayLabel(4)).toBe('Put away 4 items');
  });
});
