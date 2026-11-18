import { buildPantryIndex, type PantryRow } from '@lazychef/core/recipes/match';
import type { LocalRecipeCard } from '@lazychef/core/recipes/local-match';
import { describe, expect, it } from 'vitest';

import {
  buildIdeas,
  buildSaved,
  hashKey,
  ideaSections,
  localIdeaCount,
  savedInsert,
  savedRefOf,
  searchQuery,
  withSaved,
  type SavedRow,
} from './recipe-ideas';

const TODAY = '2026-11-18';
const item = (name: string): PantryRow => ({ name, quantity: 1, ingredient_id: null, is_staple: false, expires_on: null });
const line = (name: string) => ({ original: name, name, quantity: null, unit: null, ingredient_id: null, optional: false });
const card = (id: string, title: string, names: string[]): LocalRecipeCard => ({
  id,
  source: 'themealdb',
  title,
  image: null,
  readyInMinutes: 20,
  ingredients: names.map(line),
});

const index = buildPantryIndex([item('eggs'), item('milk'), item('flour')], TODAY);
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('buildIdeas', () => {
  const candidates = [card(UUID_A, 'Pancakes', ['eggs', 'milk', 'flour']), card(UUID_B, 'Crepes', ['eggs', 'milk', 'flour', 'butter'])];

  it('splits make now and almost there', () => {
    const ideas = buildIdeas(index, candidates, null, false);
    expect(ideas.makeNow.map((s) => s.title)).toEqual(['Pancakes']);
    expect(ideas.almostThere.map((s) => [s.title, s.need])).toEqual([['Crepes', ['butter']]]);
    expect(ideas.hasSpoonacular).toBe(false);
    expect(ideas.localCount).toBe(2);
  });

  it('adds Spoonacular ideas after the local ones and flags the credit', () => {
    const extra = [
      {
        id: 7,
        title: 'Egg Fried Rice',
        image: null,
        readyInMinutes: null,
        servings: null,
        used: [{ id: null, name: 'eggs', original: 'eggs', amount: 1, unit: '', aisle: null }],
        missed: [],
      },
    ];
    const ideas = buildIdeas(index, candidates, extra, false);
    expect(ideas.makeNow.map((s) => s.title)).toEqual(['Pancakes', 'Egg Fried Rice']);
    expect(ideas.hasSpoonacular).toBe(true);
  });

  it('lists every title match when searching', () => {
    const ideas = buildIdeas(index, candidates, null, true);
    expect(ideas.results).toHaveLength(2);
    expect(ideaSections(ideas, true)).toEqual([{ key: 'results', title: 'Results', data: ideas.results }]);
  });

  it('counts local ideas for the Spoonacular top-up rule', () => {
    expect(localIdeaCount(index, candidates, false)).toBe(2);
    expect(localIdeaCount(index, [], true)).toBe(0);
  });

  it('leaves out empty sections', () => {
    const ideas = buildIdeas(index, [candidates[0]!], null, false);
    expect(ideaSections(ideas, false).map((s) => s.title)).toEqual(['Make now']);
    expect(ideaSections(buildIdeas(index, [], null, false), false)).toEqual([]);
  });
});

describe('saved', () => {
  const rows: SavedRow[] = [
    { recipe_id: null, local_recipe_id: UUID_A, title: 'Pancakes', image_url: null, saved_by: null, created_at: '2026-11-17T10:00:00Z' },
    { recipe_id: 715538, local_recipe_id: null, title: 'Bowl', image_url: null, saved_by: null, created_at: '2026-11-16T10:00:00Z' },
    { recipe_id: null, local_recipe_id: UUID_B, title: 'Gone', image_url: null, saved_by: null, created_at: '2026-11-15T10:00:00Z' },
  ];

  it('matches local recipes, skips the match for Spoonacular ones, drops hidden ones', () => {
    const saved = buildSaved(rows, [card(UUID_A, 'Pancakes', ['eggs', 'butter'])], index);
    expect(saved.map((r) => r.id)).toEqual([UUID_A, '715538']);
    expect(saved[0]!.match).toEqual({ have: 1, need: ['butter'] });
    expect(saved[1]!.match).toBeNull();
    expect(saved[1]!.image).toContain('715538');
  });

  it('reads and edits refs', () => {
    expect(savedRefOf(rows[0]!)).toBe(UUID_A);
    expect(savedRefOf(rows[1]!)).toBe('715538');
    expect(withSaved(rows, '715538', null, 'now').map(savedRefOf)).toEqual([UUID_A, UUID_B]);
    const added = withSaved([], UUID_B, { title: 'X', image: null }, 'now');
    expect(added[0]!.local_recipe_id).toBe(UUID_B);
    expect(withSaved(rows, '715538', { title: 'Bowl', image: null }, 'now')).toHaveLength(3);
  });

  it('builds the insert like the web action', () => {
    expect(savedInsert('h', '715538', ' Bowl ', 'http://x/y.jpg')).toEqual({
      household_id: 'h',
      recipe_id: 715538,
      title: 'Bowl',
      image_url: 'http://x/y.jpg',
    });
    expect(savedInsert('h', UUID_A, 'Pancakes', null)).toEqual({ household_id: 'h', local_recipe_id: UUID_A, title: 'Pancakes' });
    expect(savedInsert('h', 'nope', 'x', null)).toBeNull();
  });
});

describe('searchQuery', () => {
  it('waits for two letters and tidies spaces', () => {
    expect(searchQuery(' ')).toBeNull();
    expect(searchQuery('e')).toBeNull();
    expect(searchQuery('  egg   fried ')).toBe('egg fried');
  });
});

describe('hashKey', () => {
  it('is stable and differs by input', () => {
    expect(hashKey('a|b')).toBe(hashKey('a|b'));
    expect(hashKey('a|b')).not.toBe(hashKey('a|c'));
  });
});
