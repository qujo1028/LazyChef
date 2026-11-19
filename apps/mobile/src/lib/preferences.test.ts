import { describe, expect, it } from 'vitest';

import { prefsFromRow, prefsSummary, toggleValue } from './preferences';

describe('toggleValue', () => {
  it('adds once and removes', () => {
    expect(toggleValue(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleValue(['a'], 'a', true)).toEqual(['a']);
    expect(toggleValue(['a', 'b'], 'a', false)).toEqual(['b']);
  });
});

describe('prefsFromRow', () => {
  it('reads no row as no restrictions', () => {
    expect(prefsFromRow(null)).toEqual({ diet: 'none', allergies: [], cuisines: [], worldRecipes: false });
  });
  it('drops unknown values', () => {
    expect(prefsFromRow({ diet: 'keto', allergies: ['dairy', 'kale'], cuisines: ['thai'], world_recipes: true })).toEqual({
      diet: 'none',
      allergies: ['dairy'],
      cuisines: ['thai'],
      worldRecipes: true,
    });
  });
});

describe('prefsSummary', () => {
  it('joins the parts', () => {
    expect(prefsSummary({ diet: 'vegan', allergies: ['tree-nut'], cuisines: ['thai'], worldRecipes: false })).toBe(
      'Vegan · No tree nut · Thai',
    );
    expect(prefsSummary({ diet: 'none', allergies: [], cuisines: [], worldRecipes: false })).toBe('No restrictions');
  });
});
