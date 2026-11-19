import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHouseholdContext } from '@/lib/household';
import { useTheme } from '@/theme';

import { Avatar } from './Avatar';

/** "Your account" card at the top of the Household tab: opens the Account screen. */
export function AccountRow() {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const router = useRouter();
  const context = useHouseholdContext();
  const name = context.data?.profile?.displayName?.trim() || 'Your account';
  const email = context.data?.email ?? null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your account, ${name}${email ? `, ${email}` : ''}`}
      onPress={() => router.push('/account')}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: minTouch,
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radius.lg,
          borderColor: colors.divider,
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        },
      ]}
    >
      <Avatar name={name} url={context.data?.profile?.avatarUrl ?? null} size={48} />
      <View style={styles.text}>
        <Text style={[type.bodySmall, { color: colors.muted }]}>Your account</Text>
        <Text numberOfLines={1} style={[type.titleSmall, { color: colors.ink }]}>
          {name}
        </Text>
        {email ? (
          <Text numberOfLines={1} style={[type.bodySmall, { color: colors.muted }]}>
            {email}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} accessibilityElementsHidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, minWidth: 0 },
});
