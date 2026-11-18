import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function PantryScreen() {
  return (
    <Screen>
      <EmptyState title="Pantry" line="Nothing here yet. Add what is in your kitchen and it will show up here." />
    </Screen>
  );
}
