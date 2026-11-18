// W2 (feature/p4-recipe-detail) owns this file. Stub from the lead's step 0.
import { parseRecipeRef } from '@lazychef/core/recipes/ref';
import { useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

/** One recipe: a Spoonacular id ("715538") or one of ours (a uuid). Opened with router.push(`/recipe/${ref}`). */
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ref = parseRecipeRef(id);
  return (
    <Screen belowTabBar={false}>
      <EmptyState title={ref ? 'Recipe' : 'Recipe not found'} line={`W2 builds this page (${id}).`} />
    </Screen>
  );
}
