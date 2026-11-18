import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

// Stub from the P1 lead. Owner: W1 auth.
export default function WelcomeScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="LazyChef" line="Welcome screen goes here." />
    </Screen>
  );
}
