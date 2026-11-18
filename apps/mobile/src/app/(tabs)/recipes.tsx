import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function RecipesScreen() {
  return (
    <Screen>
      <EmptyState title="Recipes" line="Recipes you can make will land here soon." />
    </Screen>
  );
}
