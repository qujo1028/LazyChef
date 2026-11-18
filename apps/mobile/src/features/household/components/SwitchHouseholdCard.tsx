import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { friendlyError } from '@/lib/household-settings';
import type { Membership } from '@/lib/household';
import { useTheme } from '@/theme';

import { useSwitchHousehold } from '../api';
import { SettingsCard } from './SettingsCard';

type Props = {
  userId: string;
  memberships: Membership[];
  activeId: string;
};

/** Shown only with more than one household. Tap one to make it the active household. */
export function SwitchHouseholdCard({ userId, memberships, activeId }: Props) {
  const { colors, spacing, type, minTouch } = useTheme();
  const change = useSwitchHousehold();

  return (
    <SettingsCard title="Your households" description="Pick the one you want to see.">
      <View>
        {memberships.map((m, index) => {
          const active = m.household.id === activeId;
          return (
            <Pressable
              key={m.household.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: change.isPending }}
              accessibilityLabel={m.household.name}
              disabled={active || change.isPending}
              onPress={() =>
                change.mutate(
                  { userId, householdId: m.household.id },
                  { onError: (error) => Alert.alert("Couldn't switch", friendlyError(error)) },
                )
              }
              style={({ pressed }) => [
                styles.row,
                { minHeight: minTouch, gap: spacing.md, paddingVertical: spacing.sm },
                pressed && { backgroundColor: colors.surfacePressed },
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
              ]}
            >
              <Text style={[type.body, styles.name, { color: colors.ink }]}>{m.household.name}</Text>
              {active ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1 },
});
