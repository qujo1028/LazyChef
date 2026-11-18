import { describe, expect, it } from 'vitest';

import { buildFirstPantryEntries, typedItemNames } from './first-pantry';

describe('typedItemNames', () => {
  it('splits on lines and commas', () => {
    expect(typedItemNames('2 lbs chicken breast, eggs\nmilk')).toEqual(['chicken breast', 'eggs', 'milk']);
    expect(typedItemNames('   \n ')).toEqual([]);
  });
});

describe('buildFirstPantryEntries', () => {
  it('parses amounts, units and categories', () => {
    const entries = buildFirstPantryEntries('2 lbs chicken breast\neggs', []);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      name: 'chicken breast',
      quantity: 2,
      unit: 'lb',
      category: 'meat',
      is_staple: false,
      expires_on: null,
    });
    expect(entries[1]).toMatchObject({ name: 'eggs', quantity: null, unit: 'count', category: 'dairy' });
  });

  it('adds tapped staples as untracked staples', () => {
    const entries = buildFirstPantryEntries('', ['salt', 'olive oil']);
    expect(entries).toEqual([
      expect.objectContaining({ name: 'salt', quantity: null, is_staple: true, category: 'spices' }),
      expect.objectContaining({ name: 'olive oil', quantity: null, is_staple: true, category: 'condiments' }),
    ]);
  });

  it('folds repeats into one row', () => {
    const entries = buildFirstPantryEntries('eggs\n6 eggs', []);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'eggs', quantity: 6 });
  });

  it('skips a staple that was also typed', () => {
    const entries = buildFirstPantryEntries('salt', ['salt']);
    expect(entries).toHaveLength(1);
  });

  it('returns nothing for blank input', () => {
    expect(buildFirstPantryEntries('  \n,, ', [])).toEqual([]);
  });

  it('caps very long names', () => {
    const [entry] = buildFirstPantryEntries('x'.repeat(200), []);
    expect('name' in entry && entry.name.length).toBeLessThanOrEqual(80);
  });
});
