// "I cooked this" writes, straight to Supabase as the signed-in user (RLS applies). Same rules
// as cookRecipe and undoCook in the web app's src/features/recipes/actions.ts. Both fail fast
// offline and return { error }; they never throw.
import { onlineManager } from '@tanstack/react-query';
import { z } from 'zod';

import type { ActionResult } from '@lazychef/core/list/types';
import type { CookResult, Deduction } from '@lazychef/core/recipes/cook';
import { parseRecipeRef } from '@lazychef/core/recipes/ref';

import { dbErrorMessage } from '@/lib/db-error';
import { OFFLINE_ACTION_MESSAGE } from '@/lib/household-settings';
import { supabase } from '@/lib/supabase';

const deductionsSchema = z
  .array(z.object({ item_id: z.uuid(), amount: z.number().positive().max(1_000_000) }))
  .min(1, 'Pick at least one thing to take out of the pantry.')
  .max(100);

const cookInput = z.object({ title: z.string().trim().min(1).max(200), deductions: deductionsSchema });

/** Takes the reviewed amounts out of the pantry in one transaction, logged as one "cooked" entry. */
export async function cookRecipe(
  householdId: string,
  ref: string,
  title: string,
  deductions: readonly Deduction[],
): Promise<ActionResult<{ results: CookResult[]; batchId: number }>> {
  const recipe = parseRecipeRef(ref);
  if (!recipe) return { error: "Couldn't find that recipe." };
  const parsed = cookInput.safeParse({ title, deductions });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the amounts.' };
  if (!onlineManager.isOnline()) return { error: OFFLINE_ACTION_MESSAGE };
  try {
    const { data, error } = await supabase.rpc('cook_recipe', {
      p_household_id: householdId,
      p_recipe_id: recipe.kind === 'spoonacular' ? recipe.id : null,
      p_local_recipe_id: recipe.kind === 'local' ? recipe.id : null,
      p_recipe_title: parsed.data.title,
      p_deductions: parsed.data.deductions as never,
    });
    if (error) return { error: dbErrorMessage('cook_recipe', error) };
    const rows = data ?? [];
    return {
      results: rows.map((row) => ({
        item_id: row.item_id,
        name: row.name,
        unit: row.unit,
        quantity_before: row.quantity_before === null ? null : Number(row.quantity_before),
        quantity_after: row.quantity_after === null ? null : Number(row.quantity_after),
      })),
      batchId: Number(rows[0]?.batch_id ?? 0),
    };
  } catch (error) {
    return { error: dbErrorMessage('cook_recipe', error instanceof Error ? { message: error.message } : null) };
  }
}

/** Puts back what was taken and removes the cook from the activity log, in one transaction. */
export async function undoCook(householdId: string, batchId: number, amounts: readonly Deduction[]): Promise<ActionResult> {
  const parsed = z.object({ batchId: z.number().int().positive(), amounts: deductionsSchema }).safeParse({ batchId, amounts });
  if (!parsed.success) return { error: 'Nothing to put back.' };
  if (!onlineManager.isOnline()) return { error: OFFLINE_ACTION_MESSAGE };
  try {
    const { error } = await supabase.rpc('undo_cook', {
      p_household_id: householdId,
      p_batch_id: parsed.data.batchId,
      p_amounts: parsed.data.amounts as never,
    });
    if (error) return { error: dbErrorMessage('undo_cook', error) };
    return {};
  } catch (error) {
    return { error: dbErrorMessage('undo_cook', error instanceof Error ? { message: error.message } : null) };
  }
}
