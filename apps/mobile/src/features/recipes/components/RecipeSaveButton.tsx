import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RecipeRef } from '@lazychef/core/recipes/ref';
import { useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useToast } from '@/components/Toast';
import { queryKeys } from '@/lib/household';
import { saveLabel } from '@/lib/recipe-view';
import { useTheme } from '@/theme';

import { fetchIsSaved, setSaved } from '../recipe-api';

/** The heart on the recipe page: saves the recipe for the whole household, or takes it off Saved. */
export function RecipeSaveButton({
  householdId,
  recipeRef,
  title,
  image,
}: {
  householdId: string;
  recipeRef: RecipeRef;
  title: string;
  /** Spoonacular's photo, kept with the bookmark (ours are loaded from the recipe). */
  image: string | null;
}) {
  const { colors, minTouch } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const refKey = recipeRef.kind === 'spoonacular' ? String(recipeRef.id) : recipeRef.id;
  // Under queryKeys.saved(householdId), so the Saved tab refetches when this changes.
  const key = [...queryKeys.saved(householdId), 'is-saved', refKey] as const;
  const query = useQuery({ queryKey: key, queryFn: () => fetchIsSaved(householdId, recipeRef) });
  const busy = useRef(false);
  const saved = query.data ?? false;

  async function toggle() {
    if (busy.current || query.data === undefined) return;
    busy.current = true;
    const next = !saved;
    queryClient.setQueryData(key, next);
    const result = await setSaved(householdId, recipeRef, title, image, next);
    busy.current = false;
    if (result.error !== undefined) {
      queryClient.setQueryData(key, !next);
      toast.show({ message: result.error, tone: 'error' });
      return;
    }
    toast.show({ message: next ? 'Saved for your household' : 'Removed from Saved' });
    void queryClient.invalidateQueries({ queryKey: queryKeys.saved(householdId) });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saveLabel(saved, title)}
      accessibilityState={{ selected: saved, disabled: query.data === undefined }}
      onPress={toggle}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        {
          width: minTouch,
          height: minTouch,
          borderRadius: minTouch / 2,
          borderColor: colors.divider,
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        },
      ]}
    >
      <Ionicons name={saved ? 'heart' : 'heart-outline'} size={24} color={saved ? colors.accent : colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({ button: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth } });
