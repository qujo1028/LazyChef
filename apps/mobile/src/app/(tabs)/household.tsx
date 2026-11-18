import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function HouseholdScreen() {
  return (
    <Screen>
      <EmptyState title="Household" line="The people you cook with will show up here." />
    </Screen>
  );
}
