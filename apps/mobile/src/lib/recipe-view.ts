// Pure helpers for the recipe page: turns a database row or a Spoonacular recipe into one
// view, checks it against the pantry, and works out the messages. Port of the web app's
// loadRecipe / localView / spoonacularView and the checklist wiring.
import { categoryFromAisle } from '@lazychef/core/ingredients/aisles';
import { findIngredient, guessCategory, normalizeIngredientName } from '@lazychef/core/ingredients/catalog';
import type { NewListLine } from '@lazychef/core/list/types';
import type { EdgeErrorCode } from '@lazychef/core/recipes/edge-contract';
import { recipeListLines } from '@lazychef/core/recipes/list';
import { toRecipeIngredients, type LocalIngredient } from '@lazychef/core/recipes/local-match';
import { buildPantryIndex, checkIngredients, type IngredientStatus, type PantryRow } from '@lazychef/core/recipes/match';
import { photoCredit, type PhotoCredit, type PhotoCreditFields } from '@lazychef/core/recipes/photo-credit';
import { mealDbUrl, type RecipeSource } from '@lazychef/core/recipes/ref';
import type { RecipeDetail, RecipeIngredient } from '@lazychef/core/recipes/recipe-shapes';
import { cookHistory, historyLabel, type CookedRow } from '@lazychef/core/recipes/saved';

/** One recipe, whichever place it came from. */
export type RecipeView = {
  /** Spoonacular id ("715538") or local uuid. */
  ref: string;
  source: RecipeSource;
  spoonacularId: number | null;
  title: string;
  image: string | null;
  readyInMinutes: number | null;
  servings: number | null;
  sourceUrl: string | null;
  sourceName: string | null;
  /** TheMealDB's page for an imported meal. */
  creditUrl: string | null;
  /** Author and license (or "AI-generated image") for a LazyChef library photo. */
  photoCredit: PhotoCredit | null;
  steps: string[];
  ingredients: RecipeIngredient[];
  /** Same length as `ingredients`: "to serve" lines are listed but not picked by default. */
  optional: boolean[];
  aiGenerated: boolean;
};

/** The columns the page reads from `recipes`. */
export type LocalRecipeRow = PhotoCreditFields & {
  id: string;
  source: 'themealdb' | 'lazychef' | 'user';
  source_id: string | null;
  title: string;
  image_url: string | null;
  ready_in_minutes: number | null;
  servings: number | null;
  instructions: string[];
  source_url: string | null;
  ai_generated: boolean;
};

export function hostName(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function localToView(row: LocalRecipeRow, lines: readonly LocalIngredient[]): RecipeView {
  return {
    ref: row.id,
    source: row.source,
    spoonacularId: null,
    title: row.title,
    image: row.image_url,
    readyInMinutes: row.ready_in_minutes,
    servings: row.servings,
    sourceUrl: row.source_url,
    sourceName: hostName(row.source_url),
    creditUrl: row.source === 'themealdb' && row.source_id ? mealDbUrl(row.source_id) : null,
    photoCredit: photoCredit(row),
    steps: row.instructions,
    ingredients: toRecipeIngredients(lines),
    optional: lines.map((line) => line.optional),
    aiGenerated: row.ai_generated,
  };
}

export function spoonacularToView(recipe: RecipeDetail): RecipeView {
  return {
    ref: String(recipe.id),
    source: 'spoonacular',
    spoonacularId: recipe.id,
    title: recipe.title,
    image: recipe.image,
    readyInMinutes: recipe.readyInMinutes,
    servings: recipe.servings,
    sourceUrl: recipe.sourceUrl,
    sourceName: recipe.sourceName,
    creditUrl: null,
    photoCredit: null,
    steps: recipe.steps,
    ingredients: recipe.ingredients,
    optional: recipe.ingredients.map(() => false),
    aiGenerated: false,
  };
}

export type ChecklistLine = {
  /** Position in the recipe's ingredient list. */
  index: number;
  original: string;
  name: string;
  status: IngredientStatus;
  pantryName: string | null;
  onList: boolean;
  optional: boolean;
};

export type OpenListLine = { name: string; ingredient_id: number | null };

/** Each ingredient against the live pantry, with whether it's already on the shopping list. */
export function buildChecklist(
  recipe: Pick<RecipeView, 'ingredients' | 'optional'>,
  pantry: readonly PantryRow[],
  today: string,
  openList: readonly OpenListLine[],
): ChecklistLine[] {
  const index = buildPantryIndex(pantry, today);
  const keys = new Set(openList.map((line) => normalizeIngredientName(line.name)));
  const ids = new Set(openList.flatMap((line) => (line.ingredient_id === null ? [] : [line.ingredient_id])));
  return checkIngredients(index, recipe.ingredients).map((ingredient, i) => ({
    index: i,
    original: ingredient.original,
    name: ingredient.name,
    status: ingredient.status,
    pantryName: ingredient.pantryName,
    onList: (ingredient.id !== null && ids.has(ingredient.id)) || keys.has(normalizeIngredientName(ingredient.name)),
    optional: recipe.optional[i] ?? false,
  }));
}

/** The lines to pre-select for "Add missing to list": missing, not optional, not already on the list. */
export function defaultSelection(lines: readonly ChecklistLine[]): number[] {
  return lines.filter((line) => line.status === 'need' && !line.onList && !line.optional).map((line) => line.index);
}

/** Shopping list lines for the chosen ingredient positions. Spoonacular recipes keep their id; ours are named by title. */
export function listLinesFor(
  recipe: Pick<RecipeView, 'ingredients' | 'spoonacularId' | 'title'>,
  chosen: readonly number[],
): NewListLine[] {
  const picked = [...new Set(chosen)].flatMap((i) => recipe.ingredients[i] ?? []);
  return recipeListLines(picked, {
    category: (ingredient) => {
      const fromCatalog = findIngredient(ingredient.name)?.category;
      if (fromCatalog) return fromCatalog;
      const fromAisle = categoryFromAisle(ingredient.aisle);
      return fromAisle !== 'other' ? fromAisle : guessCategory(ingredient.name);
    },
    recipe: { id: recipe.spoonacularId, title: recipe.title },
  });
}

/** Label on the button that adds the selection. */
export function addButtonLabel(chosen: number, addable: number): string {
  if (chosen === 0) return 'Pick what to add';
  if (chosen === addable) return 'Add missing to list';
  return `Add ${chosen} ${chosen === 1 ? 'item' : 'items'} to the list`;
}

export type CookRowInput = { batchId: number; createdAt: string; details: unknown };

/** "Cooked 3 times · last Sep 12" for this recipe, or null if nobody has cooked it. */
export function cookedLabelFor(
  rows: readonly CookRowInput[] | undefined,
  ref: string,
  now: number,
  timeZone?: string,
): string | null {
  if (!rows) return null;
  const mapped: CookedRow[] = rows.map((row) => ({
    batch_id: row.batchId,
    details: row.details as CookedRow['details'],
    created_at: row.createdAt,
  }));
  const history = cookHistory(mapped).get(ref);
  return history ? historyLabel(history, now, timeZone) : null;
}

/** What to say when a recipe can't be shown. Never blank. */
export type LoadProblem = { title: string; line: string };

export function problemFor(code: EdgeErrorCode | 'not_found' | 'offline' | 'unknown'): LoadProblem {
  switch (code) {
    case 'not_found':
      return { title: 'Recipe not found', line: "We couldn't find this recipe. It may have been deleted." };
    case 'not_configured':
      return { title: "Spoonacular recipes aren't set up yet", line: 'Your own recipes and the library still work.' };
    case 'resting':
      return {
        title: 'Recipe lookups are resting',
        line: "We've used today's free lookups. This recipe will open again after midnight UTC.",
      };
    case 'rate_limited':
      return { title: 'Too many lookups', line: 'Give it a few minutes, then try again.' };
    case 'offline':
      return { title: "You're offline", line: "This recipe isn't saved on this phone yet. Reconnect to open it." };
    default:
      return { title: "Couldn't load this recipe", line: 'Try again in a bit.' };
  }
}

/** The save heart's accessible label. */
export function saveLabel(saved: boolean, title: string): string {
  return saved ? `Unsave ${title}` : `Save ${title}`;
}
