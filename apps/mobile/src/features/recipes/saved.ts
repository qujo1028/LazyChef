// The household's saved recipes: reads, and the heart's save and unsave. Same writes as the web
// app's saveRecipe / unsaveRecipe actions (src/features/recipes/actions.ts). saved_recipes
// broadcasts on the household channel, so every phone refetches when one changes.
import { parseRecipeRef } from '@lazychef/core/recipes/ref';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { dbErrorMessage } from '@/lib/db-error';
import { queryKeys } from '@/lib/household';
import { OFFLINE_ACTION_MESSAGE } from '@/lib/household-settings';
import { savedInsert, savedLocalIds, savedRefOf, withSaved, type SavedRow } from '@/lib/recipe-ideas';
import { supabase } from '@/lib/supabase';
import { useHouseholdChanges } from '@/providers/household-channel';

import { getLocalCards } from './local';

async function fetchSavedRows(householdId: string): Promise<SavedRow[]> {
  const { data, error } = await supabase
    .from('saved_recipes')
    .select('recipe_id, local_recipe_id, title, image_url, saved_by, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function writeSave(householdId: string, ref: string, title: string, image: string | null): Promise<string | null> {
  if (!onlineManager.isOnline()) return OFFLINE_ACTION_MESSAGE;
  const row = savedInsert(householdId, ref, title, image);
  if (!row) return "Couldn't save that recipe.";
  const { error } =
    row.recipe_id !== undefined
      ? await supabase
          .from('saved_recipes')
          .upsert(row, { onConflict: 'household_id,recipe_id', ignoreDuplicates: true })
      : await supabase
          .from('saved_recipes')
          .upsert(row, { onConflict: 'household_id,local_recipe_id', ignoreDuplicates: true });
  return error ? dbErrorMessage('saveRecipe', error) : null;
}

async function writeUnsave(householdId: string, ref: string): Promise<string | null> {
  if (!onlineManager.isOnline()) return OFFLINE_ACTION_MESSAGE;
  const parsed = parseRecipeRef(ref);
  if (!parsed) return "Couldn't unsave that recipe.";
  const query = supabase.from('saved_recipes').delete().eq('household_id', householdId);
  const { error } = await (parsed.kind === 'spoonacular' ? query.eq('recipe_id', parsed.id) : query.eq('local_recipe_id', parsed.id));
  return error ? dbErrorMessage('unsaveRecipe', error) : null;
}

export type ToggleSaved = (ref: string, title: string, image: string | null, onError?: (message: string) => void) => void;

/** The saved rows, the matching local cards, which refs are saved, and a heart toggle with instant feedback. */
export function useSavedRecipes(householdId: string | null) {
  const client = useQueryClient();
  const id = householdId ?? 'none';
  const rows = useQuery({
    queryKey: queryKeys.saved(id),
    enabled: householdId !== null,
    queryFn: () => fetchSavedRows(householdId!),
  });

  useHouseholdChanges('saved_recipes', () => {
    if (householdId) void client.invalidateQueries({ queryKey: queryKeys.saved(householdId) });
  });

  const rowList = rows.data;
  const localIds = useMemo(() => (rowList ? savedLocalIds(rowList) : []), [rowList]);
  const cards = useQuery({
    // Under the saved key, so a saved_recipes change refetches both.
    queryKey: [...queryKeys.saved(id), 'cards', [...localIds].sort().join(',')],
    enabled: householdId !== null && rowList !== undefined,
    queryFn: () => getLocalCards(localIds, householdId!),
  });

  const refs = useMemo(() => new Set((rowList ?? []).flatMap((row) => savedRefOf(row) ?? [])), [rowList]);

  const toggle: ToggleSaved = useCallback(
    (ref, title, image, onError) => {
      if (!householdId) return;
      const key = queryKeys.saved(householdId);
      const before = client.getQueryData<SavedRow[]>(key);
      const save = !(before ?? []).some((row) => savedRefOf(row) === ref);
      // Show the heart right away; roll back if the write fails.
      client.setQueryData<SavedRow[]>(key, (current) =>
        withSaved(current ?? [], ref, save ? { title, image } : null, new Date().toISOString()),
      );
      void (save ? writeSave(householdId, ref, title, image) : writeUnsave(householdId, ref))
        .then((error) => {
          if (error) {
            client.setQueryData(key, before);
            onError?.(error);
          }
        })
        .catch(() => {
          client.setQueryData(key, before);
          onError?.("Couldn't save that. Try again.");
        })
        .finally(() => void client.invalidateQueries({ queryKey: key }));
    },
    [client, householdId],
  );

  return { rows, cards, refs, toggle };
}
