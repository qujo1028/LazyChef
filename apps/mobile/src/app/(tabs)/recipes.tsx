// W1 (feature/p4-recipes-screen) owns this file. Stub from the lead's step 0.
import { useRouter } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { Screen } from '@/components/Screen';

export default function RecipesScreen() {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState title="Recipes" line="W1 builds the Mine, Saved and Suggested screen." />
      <PrimaryPillButton title="Open a sample recipe" variant="text" onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: '00000000-0000-0000-0000-000000000000' } })} />
    </Screen>
  );
}
