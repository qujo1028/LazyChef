import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

// Stub from the P1 lead. Owner: W1 auth.
export default function SignupScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="Create account" line="Sign up goes here." />
    </Screen>
  );
}
