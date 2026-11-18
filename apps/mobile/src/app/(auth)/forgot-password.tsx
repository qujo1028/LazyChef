import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

// Stub from the P1 lead. Owner: W1 auth.
export default function ForgotPasswordScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="Reset password" line="Forgot password goes here." />
    </Screen>
  );
}
