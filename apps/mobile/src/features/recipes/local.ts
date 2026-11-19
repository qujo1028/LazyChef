// Our own recipe library (TheMealDB imports and household recipes), read as the signed-in user
// so RLS decides what is visible. Same queries as the web app's src/features/recipes/local.ts.
// Nothing here costs Spoonacular points.
import { EVERYDAY_CUISINES } from '@lazychef/core/recipes/filters';
import {
  basicKeys,
  LOCAL_CANDIDATES,
  mergeRecipeIds,
  pantryMatchKeys,
  type LocalIngredient,
  type LocalRecipeCard,
} from '@lazychef/core/recipes/local-match';
import type { PantryRow } from '@lazychef/core/recipes/match';

import { supabase } from '@/lib/supabase';

export const PHOTO_BUCKET = 'recipe-photos';
const PHOTO_URL_SECONDS = 60 * 60;
/** Recipes per ingredient query: keeps each response under PostgREST's row cap. */
const CHUNK = 25;

export type LocalCard = LocalRecipeCard & { aiGenerated: boolean };

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const EVERYDAY = new Set<string>(EVERYDAY_CUISINES);

/** Household recipes always count as everyday; library ones by their cuisine (unknown counts too). */
function isEveryday(row: { source: string; cuisine: string | null }): boolean {
  return row.source === 'user' || row.cuisine === null || EVERYDAY.has(row.cuisine.trim().toLowerCase());
}

/** Signed links for household photos, by storage path. Missing ones are just left out. */
async function signedPhotoUrls(paths: readonly (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(unique, PHOTO_URL_SECONDS);
  if (error) return urls;
  for (const row of data ?? []) if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  return urls;
}

async function ingredientsFor(ids: readonly string[]): Promise<Map<string, LocalIngredient[]>> {
  const byRecipe = new Map<string, LocalIngredient[]>();
  const results = await Promise.all(
    chunks(ids, CHUNK).map((part) =>
      supabase
        .from('recipe_ingredients')
        .select('recipe_id, position, original, name, quantity, unit, ingredient_id, optional')
        .in('recipe_id', part)
        .order('recipe_id')
        .order('position'),
    ),
  );
  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of data) {
      const list = byRecipe.get(row.recipe_id) ?? [];
      list.push({
        original: row.original,
        name: row.name,
        quantity: row.quantity === null ? null : Number(row.quantity),
        unit: row.unit,
        ingredient_id: row.ingredient_id,
        optional: row.optional,
      });
      byRecipe.set(row.recipe_id, list);
    }
  }
  return byRecipe;
}

/**
 * Cards (with ingredients and photo links) for these recipes, in the order given.
 * `everydayOnly` drops library recipes from less familiar cuisines.
 */
export async function getLocalCards(
  ids: readonly string[],
  householdId: string,
  { everydayOnly = false }: { everydayOnly?: boolean } = {},
): Promise<LocalCard[]> {
  if (ids.length === 0) return [];
  const recipeResults = await Promise.all(
    chunks(ids, 100).map((part) =>
      supabase
        .from('recipes')
        .select('id, source, cuisine, title, image_url, photo_path, ready_in_minutes, household_id, ai_generated')
        .in('id', part)
        // Only the shared library and this household.
        .or(`household_id.is.null,household_id.eq.${householdId}`),
    ),
  );
  const rows: (typeof recipeResults)[number]['data'] & object = [];
  for (const { data, error } of recipeResults) {
    if (error) throw error;
    rows.push(...(everydayOnly ? data.filter(isEveryday) : data));
  }
  const [ingredients, photos] = await Promise.all([
    ingredientsFor(rows.map((row) => row.id)),
    signedPhotoUrls(rows.map((row) => row.photo_path)),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id): LocalCard[] => {
    const row = byId.get(id);
    if (!row) return [];
    return [
      {
        id: row.id,
        source: row.source,
        title: row.title,
        image: (row.photo_path ? photos.get(row.photo_path) : null) ?? row.image_url,
        readyInMinutes: row.ready_in_minutes,
        cuisine: row.cuisine,
        ingredients: ingredients.get(row.id) ?? [],
        aiGenerated: row.ai_generated,
      },
    ];
  });
}

/**
 * The local recipes worth a closer look for this pantry: the database counts covered and
 * missing lines for every recipe and hands back the best ones. With a search, every recipe
 * whose title has the words comes back, however much is missing.
 */
export async function findLocalCandidates(
  householdId: string,
  items: readonly PantryRow[],
  query: string | null,
): Promise<LocalCard[]> {
  const pantry = pantryMatchKeys(items);
  const basics = basicKeys();
  const search = query !== null;
  const { data, error } = await supabase.rpc('match_local_recipes', {
    p_household_id: householdId,
    p_ingredient_ids: pantry.ids,
    p_name_keys: pantry.keys,
    p_ignore_ids: basics.ids,
    p_ignore_keys: basics.keys,
    p_meal_type: null,
    p_max_minutes: null,
    p_query: query,
    // The database counts exact keys; the exact check afterwards can only find more of the pantry.
    p_max_missing: search ? 100 : 5,
    // Room for the less familiar cuisines dropped below.
    p_limit: (search ? 60 : LOCAL_CANDIDATES) * 2,
  });
  if (error) throw error;
  return getLocalCards(mergeRecipeIds([data ?? []]), householdId, { everydayOnly: true });
}

/** The household's own recipes, newest first (the Mine filter). */
export async function getHouseholdRecipes(householdId: string): Promise<LocalCard[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return getLocalCards(
    data.map((row) => row.id),
    householdId,
  );
}
