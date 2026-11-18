import type { RecipeDetail } from '@lazychef/core/recipes/recipe-shapes';
import { describe, expect, it } from 'vitest';

import {
  addButtonLabel,
  buildChecklist,
  cookedLabelFor,
  defaultSelection,
  hostName,
  listLinesFor,
  localToView,
  problemFor,
  spoonacularToView,
  type LocalRecipeRow,
} from './recipe-view';

const row: LocalRecipeRow = {
  id: '11111111-1111-4111-8111-111111111111',
  source: 'themealdb',
  source_id: '52772',
  title: 'Teriyaki chicken',
  image_url: 'https://img/x.jpg',
  ready_in_minutes: 30,
  servings: 4,
  instructions: ['Cook it.'],
  source_url: 'https://www.example.com/teriyaki',
  ai_generated: false,
};

const lines = [
  { original: '2 eggs', name: 'eggs', quantity: 2, unit: 'count', ingredient_id: null, optional: false },
  { original: '1 cup rice', name: 'rice', quantity: 1, unit: 'cup', ingredient_id: null, optional: false },
  { original: 'parsley, to serve', name: 'parsley', quantity: null, unit: null, ingredient_id: null, optional: true },
];

const pantry = (name: string) => ({ name, quantity: 3, ingredient_id: null, is_staple: false, expires_on: null });

describe('localToView', () => {
  it('maps a library recipe and links TheMealDB', () => {
    const view = localToView(row, lines);
    expect(view.creditUrl).toBe('https://www.themealdb.com/meal/52772');
    expect(view.sourceName).toBe('example.com');
    expect(view.spoonacularId).toBeNull();
    expect(view.optional).toEqual([false, false, true]);
    expect(view.ingredients[0].unit).toBe('');
  });

  it('has no credit link for a household recipe', () => {
    const view = localToView({ ...row, source: 'user', source_id: null }, lines);
    expect(view.creditUrl).toBeNull();
  });
});

describe('spoonacularToView', () => {
  it('keeps the id and the source link', () => {
    const detail: RecipeDetail = {
      id: 715538,
      title: 'Pasta',
      image: null,
      readyInMinutes: 20,
      servings: 2,
      sourceUrl: 'https://x.test/p',
      sourceName: 'X',
      summary: null,
      ingredients: [{ id: 1, name: 'pasta', original: '1 lb pasta', amount: 1, unit: 'lb', aisle: null }],
      steps: ['Boil.'],
      dishTypes: [],
    };
    const view = spoonacularToView(detail);
    expect(view.ref).toBe('715538');
    expect(view.spoonacularId).toBe(715538);
    expect(view.optional).toEqual([false]);
  });
});

describe('hostName', () => {
  it('strips www and survives junk', () => {
    expect(hostName('https://www.a.com/x')).toBe('a.com');
    expect(hostName('nope')).toBeNull();
    expect(hostName(null)).toBeNull();
  });
});

describe('buildChecklist', () => {
  const view = localToView(row, lines);
  it('marks have, need and what is already on the list', () => {
    const out = buildChecklist(view, [pantry('eggs')], '2026-11-18', [{ name: 'Rice', ingredient_id: null }]);
    expect(out.map((l) => l.status)).toEqual(['have', 'need', 'need']);
    expect(out[0].pantryName).toBe('eggs');
    expect(out[1].onList).toBe(true);
    expect(out[2].optional).toBe(true);
  });

  it('skips optional and listed lines by default', () => {
    const out = buildChecklist(view, [], '2026-11-18', []);
    expect(defaultSelection(out)).toEqual([0, 1]);
    const listed = buildChecklist(view, [], '2026-11-18', [{ name: 'eggs', ingredient_id: null }]);
    expect(defaultSelection(listed)).toEqual([1]);
  });
});

describe('listLinesFor', () => {
  it('uses the recipe id for Spoonacular and the title for ours', () => {
    const mine = localToView(row, lines);
    const [line] = listLinesFor(mine, [1, 1]);
    expect(listLinesFor(mine, [1, 1])).toHaveLength(1);
    expect(line.recipe_id).toBeNull();
    expect(line.recipe_title).toBe('Teriyaki chicken');
    expect(line.name).toBe('rice');
    const theirs = { ...mine, spoonacularId: 99 };
    expect(listLinesFor(theirs, [1])[0].recipe_id).toBe(99);
  });

  it('ignores positions that do not exist', () => {
    expect(listLinesFor(localToView(row, lines), [9])).toEqual([]);
  });
});

describe('addButtonLabel', () => {
  it('reads plainly', () => {
    expect(addButtonLabel(0, 3)).toBe('Pick what to add');
    expect(addButtonLabel(3, 3)).toBe('Add missing to list');
    expect(addButtonLabel(1, 3)).toBe('Add 1 item to the list');
    expect(addButtonLabel(2, 3)).toBe('Add 2 items to the list');
  });
});

describe('cookedLabelFor', () => {
  const ref = '11111111-1111-4111-8111-111111111111';
  const cook = (batchId: number, createdAt: string, id = ref) => ({
    batchId,
    createdAt,
    details: { recipe_title: 'Teriyaki chicken', local_recipe_id: id },
  });
  const now = Date.parse('2026-11-18T12:00:00Z');

  it('counts batches, not rows, and only this recipe', () => {
    const rows = [
      cook(1, '2026-09-12T18:00:00Z'),
      cook(1, '2026-09-12T18:00:00Z'),
      cook(2, '2026-09-01T18:00:00Z'),
      cook(3, '2026-09-20T18:00:00Z', '22222222-2222-4222-8222-222222222222'),
    ];
    expect(cookedLabelFor(rows, ref, now, 'UTC')).toBe('Cooked twice · last Sep 12');
  });

  it('is null with no history or no rows yet', () => {
    expect(cookedLabelFor([], ref, now, 'UTC')).toBeNull();
    expect(cookedLabelFor(undefined, ref, now, 'UTC')).toBeNull();
  });
});

describe('problemFor', () => {
  it('has a message for every case and no em dashes', () => {
    for (const code of ['not_found', 'not_configured', 'resting', 'rate_limited', 'offline', 'upstream', 'unknown'] as const) {
      const p = problemFor(code);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.line.length).toBeGreaterThan(0);
      expect(p.title + p.line).not.toContain('—');
    }
  });
});
