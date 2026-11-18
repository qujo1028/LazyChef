import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function ListScreen() {
  return (
    <Screen>
      <EmptyState title="List" line="Your shopping list is empty. Nice and tidy." />
    </Screen>
  );
}
