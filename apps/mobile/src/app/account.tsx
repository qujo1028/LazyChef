import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AboutCard } from '@/features/account/components/AboutCard';
import { DeleteAccountCard } from '@/features/account/components/DeleteAccountCard';
import { FoodPreferencesCard } from '@/features/account/components/FoodPreferencesCard';
import { ProfileCard } from '@/features/account/components/ProfileCard';
import { SignOutCard } from '@/features/account/components/SignOutCard';
import { WeeklyGoalCard } from '@/features/account/components/WeeklyGoalCard';
import { NotificationsCard } from '@/features/push/components/NotificationsCard';
import { useTheme } from '@/theme';

// Haptics on/off is skipped on purpose: the app has no haptics setting to toggle (lib/haptics.ts always fires).
export default function AccountScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: spacing.xl + insets.bottom,
          gap: spacing.lg,
        }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ProfileCard />
        <WeeklyGoalCard />
        <FoodPreferencesCard />
        <NotificationsCard />
        <AboutCard />
        <SignOutCard />
        <DeleteAccountCard />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
