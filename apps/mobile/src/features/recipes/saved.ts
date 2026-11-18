// The household's saved recipes: reads, and the heart's save and unsave. Same writes as the web
// app's saveRecipe / unsaveRecipe actions (src/features/recipes/actions.ts). saved_recipes
// broadcasts on the household channel, so every phone refetches when one changes.
import { parseRecipeRef } from '@lazychef/core/recipes/ref';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { queryKeys } from '@/lib/household';
import { savedLocalIds, savedRefOf, withSaved, type SavedRow } from '@/lib/recipe-ideas';
import { supabase } from '@/lib/supabase';
import { useHouseholdChanges } from '@/providers/household-channel';

import { getLocalCards } from './local';
import { setSaved } from './recipe-api';

async function fetchSavedRows(householdId: string): Promise<SavedRow[]> {
  const { data, error } = await supabase
    .from('saved_recipes')
    .select('recipe_id, local_recipe_id, title, image_url, saved_by, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function write(householdId: string, ref: string, title: string, image: string | null, save: boolean): Promise<string | null> {
  const parsed = parseRecipeRef(ref);
  if (!parsed) return "Couldn't save that recipe.";
  const { error } = await setSaved(householdId, parsed, title.trim().slice(0, 200) || 'Recipe', image, save);
  return error ?? null;
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
    placeholderData: keepPreviousData,
    queryFn: () => getLocalCards(localIds, householdId!),
  });

  const refs = useMemo(() => new Set((rowList ?? []).flatMap((row) => savedRefOf(row) ?? [])), [rowList]);

  const toggle: ToggleSaved = useCallback(
    (rawRef, title, image, onError) => {
      if (!householdId) return;
      const ref = rawRef.toLowerCase();
      const key = queryKeys.saved(householdId);
      const before = client.getQueryData<SavedRow[]>(key);
      const save = !(before ?? []).some((row) => savedRefOf(row) === ref);
      // Show the heart right away; roll back if the write fails.
      client.setQueryData<SavedRow[]>(key, (current) =>
        withSaved(current ?? [], ref, save ? { title, image } : null, new Date().toISOString()),
      );
      // Undo only this heart, so overlapping taps on other recipes keep their own state.
      const previous = (before ?? []).find((row) => savedRefOf(row) === ref);
      const undo = () =>
        client.setQueryData<SavedRow[]>(key, (current) =>
          withSaved(current ?? [], ref, previous ? { title: previous.title, image: previous.image_url } : null, previous?.created_at ?? ''),
        );
      void write(householdId, ref, title, image, save)
        .then((error) => {
          if (error) {
            undo();
            onError?.(error);
          }
        })
        .catch(() => {
          undo();
          onError?.("Couldn't save that. Try again.");
        })
        .finally(() => void client.invalidateQueries({ queryKey: key }));
    },
    [client, householdId],
  );

  return { rows, cards, refs, toggle };
}
