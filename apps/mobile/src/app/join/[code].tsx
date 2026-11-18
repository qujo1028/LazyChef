import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

// Stub from the P1 lead. Owner: W2 onboarding.
export default function JoinScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="Join a household" line="Join by link goes here." />
    </Screen>
  );
}
