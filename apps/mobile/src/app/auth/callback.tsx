import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

// Stub from the P1 lead. Owner: W1 auth.
export default function AuthCallbackScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="Signing you in" line="Auth callback goes here." />
    </Screen>
  );
}
