import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, Text } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  /** Toggle chips pass selected; plain action chips leave it undefined. */
  selected?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** Spoken label when it differs from the text (e.g. "1 week, Nov 25"). */
  accessibilityLabel?: string;
  disabled?: boolean;
};

/** A pill chip with a 44pt target: outlined, or olive-edged when selected (same look as the onboarding staples). */
export function Chip({ label, onPress, selected, icon, accessibilityLabel, disabled }: Props) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const on = selected === true;
  return (
    <Pressable
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? { disabled } : { checked: on, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        minHeight: minTouch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        borderWidth: on ? 2 : 1,
        borderColor: on ? colors.primary : colors.outline,
        backgroundColor: on || pressed ? colors.surfacePressed : colors.surface,
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={16} color={colors.ink} /> : null}
      <Text style={[type.bodySmall, { color: colors.ink }]}>{label}</Text>
    </Pressable>
  );
}
