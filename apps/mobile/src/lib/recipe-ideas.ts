// Putting the Recipes screen's data together: local candidates and Spoonacular's extras ranked
// against the live pantry, and the saved list. Pure, so Vitest can run it.
import {
  LOCAL_ENOUGH,
  localSuggestion,
  mergeLists,
  mergeSuggestions,
  rankLocal,
  rankSearch,
  rankSpoonacularSearch,
  wantsSpoonacular,
  type LocalRecipeCard,
} from '@lazychef/core/recipes/local-match';
import {
  sortSuggestions,
  type PantryIndex,
  type Suggestion,
  type Suggestions,
} from '@lazychef/core/recipes/match';
import type { RecipeSummary } from '@lazychef/core/recipes/recipe-shapes';
import { parseRecipeRef } from '@lazychef/core/recipes/ref';
import type { SavedRecipe } from '@lazychef/core/recipes/saved';

import { spoonacularImage } from './recipe-cards';

export { LOCAL_ENOUGH, wantsSpoonacular };

export type Ideas = {
  /** Without a search: "Make now" and "Almost there". */
  makeNow: Suggestion[];
  almostThere: Suggestion[];
  /** With a search: every match, best first. */
  results: Suggestion[];
  /** True when any card came from Spoonacular (it needs the credit line). */
  hasSpoonacular: boolean;
  /** How many ideas our own library gave. */
  localCount: number;
};

/** How many local ideas there are before Spoonacular is asked. */
export function localIdeaCount(index: PantryIndex, candidates: readonly LocalRecipeCard[], search: boolean): number {
  if (search) return rankSearch(index, candidates).length;
  const ranked = rankLocal(index, candidates);
  return ranked.makeNow.length + ranked.almostThere.length;
}

/** Local candidates, plus Spoonacular's recipes when we asked for them, ranked for this pantry. */
export function buildIdeas(
  index: PantryIndex,
  candidates: readonly LocalRecipeCard[],
  extra: readonly RecipeSummary[] | null,
  search: boolean,
): Ideas {
  const hasExtra = extra !== null && extra.length > 0;
  if (search) {
    const local = rankSearch(index, candidates);
    const results = hasExtra ? mergeLists(local, rankSpoonacularSearch(index, extra)) : local;
    return {
      makeNow: [],
      almostThere: [],
      results,
      hasSpoonacular: results.some((s) => s.source === 'spoonacular'),
      localCount: local.length,
    };
  }
  const local = rankLocal(index, candidates);
  const merged: Suggestions = mergeSuggestions(local, hasExtra ? sortSuggestions(index, extra) : null);
  const all = [...merged.makeNow, ...merged.almostThere];
  return {
    makeNow: merged.makeNow,
    almostThere: merged.almostThere,
    results: [],
    hasSpoonacular: all.some((s) => s.source === 'spoonacular'),
    localCount: local.makeNow.length + local.almostThere.length,
  };
}

export type IdeaSection = { key: string; title: string; data: Suggestion[] };

/** The sections the Suggested list shows, leaving out empty ones. */
export function ideaSections(ideas: Ideas, searching: boolean): IdeaSection[] {
  if (searching) {
    return ideas.results.length > 0 ? [{ key: 'results', title: 'Results', data: ideas.results }] : [];
  }
  const sections: IdeaSection[] = [
    { key: 'make-now', title: 'Make now', data: ideas.makeNow },
    { key: 'almost', title: 'Almost there (1 to 3 missing)', data: ideas.almostThere },
  ];
  return sections.filter((s) => s.data.length > 0);
}

// ── Saved ───────────────────────────────────────────────────────────────────

export type SavedRow = {
  recipe_id: number | null;
  local_recipe_id: string | null;
  title: string;
  image_url: string | null;
  saved_by: string | null;
  created_at: string;
};

/** A saved row's recipe ref, or null for a row with neither id. */
export function savedRefOf(row: Pick<SavedRow, 'recipe_id' | 'local_recipe_id'>): string | null {
  if (row.local_recipe_id) return row.local_recipe_id.toLowerCase();
  return row.recipe_id !== null ? String(row.recipe_id) : null;
}

/** The ids of the local recipes among the saved rows. */
export function savedLocalIds(rows: readonly SavedRow[]): string[] {
  return rows.flatMap((row) => (row.local_recipe_id ? [row.local_recipe_id] : []));
}

/**
 * Saved rows as recipes with a pantry match. Local recipes are matched (a recipe that is no
 * longer visible is left out); Spoonacular ones keep `match: null` since their ingredients
 * need the `info` call.
 */
export function buildSaved(
  rows: readonly SavedRow[],
  cards: readonly (LocalRecipeCard & { aiGenerated?: boolean })[],
  index: PantryIndex,
): SavedRecipe[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return rows.flatMap((row): SavedRecipe[] => {
    const base = { savedAt: row.created_at, savedBy: row.saved_by, history: null };
    if (row.local_recipe_id) {
      const card = byId.get(row.local_recipe_id);
      if (!card) return [];
      const s = localSuggestion(index, card);
      return [
        {
          ...base,
          id: card.id,
          source: card.source,
          title: card.title,
          image: card.image,
          readyInMinutes: card.readyInMinutes,
          match: { have: s.have.length, need: s.need },
          aiGenerated: card.aiGenerated,
        },
      ];
    }
    if (row.recipe_id === null) return [];
    return [
      {
        ...base,
        id: String(row.recipe_id),
        source: 'spoonacular',
        title: row.title,
        image: row.image_url ?? spoonacularImage(row.recipe_id),
        readyInMinutes: null,
        match: null,
      },
    ];
  });
}

/** Adds or removes a saved row in a list, for the instant heart. */
export function withSaved(
  rows: readonly SavedRow[],
  ref: string,
  save: { title: string; image: string | null } | null,
  now: string,
): SavedRow[] {
  const rest = rows.filter((row) => savedRefOf(row) !== ref);
  if (!save) return rest;
  const parsed = parseRecipeRef(ref);
  if (!parsed) return [...rows];
  const row: SavedRow =
    parsed.kind === 'spoonacular'
      ? { recipe_id: parsed.id, local_recipe_id: null, title: save.title, image_url: save.image, saved_by: null, created_at: now }
      : { recipe_id: null, local_recipe_id: parsed.id, title: save.title, image_url: null, saved_by: null, created_at: now };
  return [row, ...rest];
}

/** What the search box sends: trimmed, and nothing until there are two letters. */
export function searchQuery(text: string): string | null {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length >= 2 ? trimmed.slice(0, 80) : null;
}

/** A short stable key for a long string (the pantry's match keys), for query keys. */
export function hashKey(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
