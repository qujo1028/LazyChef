import type { ListItem } from '@lazychef/core/list/types';
import { describe, expect, it } from 'vitest';

import { listSubtitle, undoLine } from './list-edit';

const item = {
  id: 'a',
  household_id: 'h',
  name: 'Milk',
  quantity: 2,
  unit: 'cup',
  category: 'dairy',
  ingredient_id: 7,
  note: 'whole',
  recipe_id: 3,
  recipe_title: 'Pancakes',
  checked_at: null,
  checked_by: null,
} as unknown as ListItem;

describe('undoLine', () => {
  it('keeps what the line needs to come back', () => {
    expect(undoLine(item)).toEqual({
      name: 'Milk',
      quantity: 2,
      unit: 'cup',
      category: 'dairy',
      ingredient_id: 7,
      note: 'whole',
      recipe_id: 3,
      recipe_title: 'Pancakes',
    });
  });
});

describe('listSubtitle', () => {
  it('says any amount when there is none', () => {
    expect(listSubtitle({ quantity: null, unit: null, recipe_title: null })).toBe('Any amount');
  });
  it('adds the recipe', () => {
    expect(listSubtitle({ quantity: 3, unit: null, recipe_title: 'Pancakes' })).toBe('3 · For Pancakes');
  });
});
