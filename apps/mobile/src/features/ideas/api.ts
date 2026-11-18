// What an idea card does with an idea: "Save to Mine" (the save_ai_recipe RPC, as the signed-in
// user, port of the web's saveAiRecipe) and "Add missing to list". Neither throws.
import { onlineManager } from '@tanstack/react-query';
import type { AiIdea, AiIdeaMeal } from '@lazychef/core/ai/edge-contract';
import { ingredientRows, ownInputFromIdea } from '@lazychef/core/ai/idea-save';
import { describeListAdditions } from '@lazychef/core/list/plan';
import { fieldErrors, recipePayload, validateOwnRecipe } from '@lazychef/core/recipes/own-recipe';

import { addListItems } from '@/features/list/api';
import { setSaved } from '@/features/recipes/recipe-api';
import { dbErrorMessage } from '@/lib/db-error';
import { OFFLINE_ACTION_MESSAGE } from '@/lib/household-settings';
import { supabase } from '@/lib/supabase';

export type IdeaActionResult = { message: string; ok: boolean };

/** Saves an idea as one of the household's own recipes (flagged AI-made), then bookmarks it. */
export async function saveIdeaToMine(householdId: string, idea: AiIdea, meal: AiIdeaMeal): Promise<IdeaActionResult> {
  if (!onlineManager.isOnline()) return { ok: false, message: OFFLINE_ACTION_MESSAGE };
  const parsed = validateOwnRecipe(ownInputFromIdea(idea.recipe, meal));
  if (!parsed.success) {
    return { ok: false, message: Object.values(fieldErrors(parsed.error))[0] ?? "Couldn't save that idea." };
  }
  const recipe = parsed.data;
  const { data: id, error } = await supabase.rpc('save_ai_recipe', {
    p_household_id: householdId,
    p_recipe: { ...recipePayload(recipe), summary: idea.recipe.description || null },
    p_ingredients: ingredientRows(recipe),
  });
  if (error) return { ok: false, message: dbErrorMessage('save_ai_recipe', error) };
  // The recipe is saved already; a failed bookmark only costs the heart, like the web.
  const bookmark = await setSaved(householdId, { kind: 'local', id }, recipe.title, null, true);
  if (bookmark.error && __DEV__) console.warn('[ideas] bookmarking the new recipe failed:', bookmark.error);
  return { ok: true, message: 'Saved to Mine' };
}

/** Puts the ingredients the pantry doesn't have on the shopping list. */
export async function addMissingToList(householdId: string, idea: AiIdea): Promise<IdeaActionResult> {
  if (idea.missing.length === 0) return { ok: true, message: 'Nothing to add' };
  const result = await addListItems(
    householdId,
    idea.missing.map((name) => ({ name, quantity: null, unit: null })),
  );
  if (result.error !== undefined) return { ok: false, message: result.error };
  return { ok: true, message: `${describeListAdditions(result)} on the shopping list` };
}
