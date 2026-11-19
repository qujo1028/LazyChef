import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GOAL_MAX, GOAL_MIN, useSetWeeklyGoal, useWeeklyGoal } from '@/features/habit/use-weekly-goal';
import { SettingsCard } from '@/features/household/components/SettingsCard';
import { goalLine } from '@/lib/account';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme';

/** Cook N nights a week, 1 to 7, with a minus and plus stepper. Saves as you tap (optimistic). */
export function WeeklyGoalCard() {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const { goal } = useWeeklyGoal();
  const save = useSetWeeklyGoal();

  const step = (next: number) => {
    if (next < GOAL_MIN || next > GOAL_MAX) return;
    haptic('tap');
    save.mutate(next);
  };

  const button = (label: string, icon: 'remove' | 'add', next: number, off: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={() => step(next)}
      style={({ pressed }) => [
        styles.step,
        {
          width: minTouch,
          height: minTouch,
          borderRadius: radius.pill,
          borderColor: colors.outline,
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
          opacity: off ? 0.4 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.ink} />
    </Pressable>
  );

  return (
    <SettingsCard title="Weekly goal" description="Your ring fills as you cook. Pick a number you can keep up.">
      <View style={[styles.row, { gap: spacing.md }]}>
        {button('Fewer nights', 'remove', goal - 1, goal <= GOAL_MIN)}
        <Text
          accessibilityRole="adjustable"
          accessibilityLabel={goalLine(goal)}
          accessibilityValue={{ min: GOAL_MIN, max: GOAL_MAX, now: goal }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? goal + 1 : goal - 1)}
          style={[type.heading, styles.value, { color: colors.ink }]}
        >
          {goalLine(goal)}
        </Text>
        {button('More nights', 'add', goal + 1, goal >= GOAL_MAX)}
      </View>
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  step: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  value: { flex: 1, textAlign: 'center' },
});
