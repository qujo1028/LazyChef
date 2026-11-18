import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

// Stub from the P1 lead. Owner: W1 auth.
export default function LoginScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="Sign in" line="Sign in goes here." />
    </Screen>
  );
}
