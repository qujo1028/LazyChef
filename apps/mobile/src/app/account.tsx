import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';

// P6 W3 builds this screen: avatar, name, weekly goal, food preferences, haptics,
// notifications (W4's NotificationsCard), legal links, sign out, delete account.
export default function AccountScreen() {
  return (
    <Screen belowTabBar={false}>
      <EmptyState title="Account" line="Your settings will show up here." />
    </Screen>
  );
}
