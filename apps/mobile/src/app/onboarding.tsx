import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

// Stub from the P1 lead. Owner: W2 onboarding.
export default function OnboardingScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="Welcome" line="Onboarding goes here." />
    </Screen>
  );
}
