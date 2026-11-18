import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

export default function ActivityScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="Activity" line="Nothing has happened yet. Cooking and shopping will show up here." />
    </Screen>
  );
}
