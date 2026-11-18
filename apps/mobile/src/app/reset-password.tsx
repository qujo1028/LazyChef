import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

// Stub from the P1 lead. Owner: W1 auth.
export default function ResetPasswordScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="New password" line="Set a new password here." />
    </Screen>
  );
}
