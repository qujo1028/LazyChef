// Loads one recipe for the recipe page. Ours (TheMealDB imports and household recipes) are read
// straight from Postgres as the signed-in user, so RLS decides what's visible. Spoonacular's
// come from the `recipes` Edge Function (it holds the key and the shared cache).
import { onlineManager } from '@tanstack/react-query';
import type { EdgeErrorCode } from '@lazychef/core/recipes/edge-contract';
import type { LocalIngredient } from '@lazychef/core/recipes/local-match';
import type { RecipeRef } from '@lazychef/core/recipes/ref';

import { supabase } from '@/lib/supabase';
import { localToView, spoonacularToView, type RecipeView } from '@/lib/recipe-view';

import { callRecipes } from './edge';

/** Why a recipe couldn't load. `code` picks the message (see problemFor in lib/recipe-view.ts). */
export class RecipeLoadError extends Error {
  constructor(
    readonly code: EdgeErrorCode | 'not_found' | 'offline' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'RecipeLoadError';
  }
}

const PHOTO_BUCKET = 'recipe-photos';
const PHOTO_URL_SECONDS = 60 * 60;

async function fetchLocal(id: string, householdId: string): Promise<RecipeView> {
  const [recipe, lines] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, source, source_id, title, image_url, photo_path, ready_in_minutes, servings, instructions, source_url, ai_generated')
      .eq('id', id)
      // Only the shared library and this household.
      .or(`household_id.is.null,household_id.eq.${householdId}`)
      .maybeSingle(),
    supabase
      .from('recipe_ingredients')
      .select('position, original, name, quantity, unit, ingredient_id, optional')
      .eq('recipe_id', id)
      .order('position'),
  ]);
  if (recipe.error) throw recipe.error;
  if (lines.error) throw lines.error;
  if (!recipe.data) throw new RecipeLoadError('not_found', 'Recipe not found');

  const ingredients: LocalIngredient[] = lines.data.map((row) => ({
    original: row.original,
    name: row.name,
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    ingredient_id: row.ingredient_id,
    optional: row.optional,
  }));
  const view = localToView(recipe.data, ingredients);
  if (recipe.data.photo_path) {
    const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(recipe.data.photo_path, PHOTO_URL_SECONDS);
    if (data?.signedUrl) view.image = data.signedUrl;
  }
  return view;
}

async function fetchSpoonacular(id: number, householdId: string): Promise<RecipeView> {
  const result = await callRecipes({ action: 'info', householdId, ids: [id] });
  if (result.error !== undefined) {
    throw new RecipeLoadError(onlineManager.isOnline() ? result.code : 'offline', result.error);
  }
  const recipe = result.recipes[0];
  if (!recipe) throw new RecipeLoadError('not_found', 'Recipe not found');
  return spoonacularToView(recipe);
}

/** A query function for queryKeys.recipe(householdId, ref). Throws RecipeLoadError. */
export async function fetchRecipe(householdId: string, ref: RecipeRef): Promise<RecipeView> {
  if (ref.kind === 'local') {
    try {
      return await fetchLocal(ref.id, householdId);
    } catch (error) {
      if (error instanceof RecipeLoadError) throw error;
      throw new RecipeLoadError(onlineManager.isOnline() ? 'unknown' : 'offline', error instanceof Error ? error.message : 'Load failed');
    }
  }
  return fetchSpoonacular(ref.id, householdId);
}

/** Is this recipe on the household's Saved list? */
export async function fetchIsSaved(householdId: string, ref: RecipeRef): Promise<boolean> {
  const query = supabase.from('saved_recipes').select('id').eq('household_id', householdId);
  const { data, error } = await (ref.kind === 'spoonacular' ? query.eq('recipe_id', ref.id) : query.eq('local_recipe_id', ref.id)).limit(1);
  if (error) throw error;
  return data.length > 0;
}

/** Saves for the whole household (a bookmark, not a copy). Same rows as the web app's saveRecipe. */
export async function setSaved(
  householdId: string,
  ref: RecipeRef,
  title: string,
  image: string | null,
  saved: boolean,
): Promise<{ error?: string }> {
  if (!onlineManager.isOnline()) return { error: "You're offline. Try again when you're back online." };
  try {
    if (saved) {
      const { error } =
        ref.kind === 'spoonacular'
          ? await supabase
              .from('saved_recipes')
              .upsert(
                { household_id: householdId, recipe_id: ref.id, title, image_url: image },
                { onConflict: 'household_id,recipe_id', ignoreDuplicates: true },
              )
          : await supabase
              .from('saved_recipes')
              .upsert(
                { household_id: householdId, local_recipe_id: ref.id, title },
                { onConflict: 'household_id,local_recipe_id', ignoreDuplicates: true },
              );
      if (error) return { error: "Couldn't save that recipe. Try again." };
    } else {
      const query = supabase.from('saved_recipes').delete().eq('household_id', householdId);
      const { error } = await (ref.kind === 'spoonacular' ? query.eq('recipe_id', ref.id) : query.eq('local_recipe_id', ref.id));
      if (error) return { error: "Couldn't remove that recipe. Try again." };
    }
    return {};
  } catch {
    return { error: "Couldn't reach the server. Try again." };
  }
}
