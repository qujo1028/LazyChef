// What a recipe card shows, built from the three sources on the Recipes screen (suggestions,
// saved recipes, the household's own). Pure, so Vitest can run it.
import { displayName } from '@lazychef/core/pantry/display';
import type { Suggestion } from '@lazychef/core/recipes/match';
import type { RecipeSource } from '@lazychef/core/recipes/ref';
import { canMakeNow, type SavedRecipe } from '@lazychef/core/recipes/saved';

export type CardMatch = { have: number; need: string[] };

export type RecipeCardData = {
  /** The recipe ref: a Spoonacular id or our uuid. */
  id: string;
  source: RecipeSource;
  title: string;
  image: string | null;
  readyInMinutes: number | null;
  /** Null when the pantry can't be checked (a saved Spoonacular recipe without its details). */
  match: CardMatch | null;
  aiGenerated?: boolean;
};

export function cardFromSuggestion(s: Suggestion): RecipeCardData {
  return {
    id: s.id,
    source: s.source,
    title: s.title,
    image: s.image,
    readyInMinutes: s.readyInMinutes,
    match: { have: s.have.length, need: s.need },
    aiGenerated: s.aiGenerated,
  };
}

export function cardFromSaved(r: SavedRecipe): RecipeCardData {
  return {
    id: r.id,
    source: r.source,
    title: r.title,
    image: r.image,
    readyInMinutes: r.readyInMinutes,
    match: r.match,
    aiGenerated: r.aiGenerated,
  };
}

/** "25 min", "1 h", "1 h 15 min"; null when unknown. */
export function readyLabel(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** How many names "Missing:" lists before it says "and 2 more". */
const MISSING_SHOWN = 3;

/** Suggested cards: "Missing: eggs, milk" or "You have everything". */
export function missingLine(need: readonly string[]): string {
  if (need.length === 0) return 'You have everything';
  const shown = need.slice(0, MISSING_SHOWN).map(displayName).join(', ');
  const more = need.length - MISSING_SHOWN;
  return `Missing: ${shown}${more > 0 ? ` and ${more} more` : ''}`;
}

/** Saved and Mine cards: "Can make now" or "Have 5 of 7"; null when it can't be checked. */
export function haveLine(match: CardMatch | null): string | null {
  if (!match) return null;
  if (match.need.length === 0) return 'Can make now';
  return `Have ${match.have} of ${match.have + match.need.length}`;
}

/** Saved list summary: "3 saved · 1 you can make now". */
export function savedSummary(recipes: readonly SavedRecipe[]): string {
  if (recipes.length === 0) return "Your household's favorites.";
  const ready = recipes.filter(canMakeNow).length;
  return `${recipes.length} saved${ready > 0 ? ` · ${ready} you can make now` : ''}`;
}

/** Where a Spoonacular recipe's photo lives, for saved rows that kept no image. */
export function spoonacularImage(recipeId: number): string {
  return `https://img.spoonacular.com/recipes/${recipeId}-312x231.jpg`;
}
