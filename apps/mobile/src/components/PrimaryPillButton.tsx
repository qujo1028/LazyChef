import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/hooks/use-press-scale';
import { useTheme } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows a spinner and blocks presses (for example while a request is in flight). */
  loading?: boolean;
  /** primary: olive fill. outline: control outline on surface. text: no box, olive label. danger: outline in the danger colour. */
  variant?: 'primary' | 'outline' | 'text' | 'danger';
  accessibilityLabel?: string;
};

export function PrimaryPillButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  accessibilityLabel,
}: Props) {
  const { colors, radius, type, minTouch } = useTheme();
  const press = usePressScale(0.97);
  const blocked = disabled || loading;

  const filled = variant === 'primary';
  const labelColor = filled
    ? colors.onPrimary
    : blocked
      ? colors.disabledText
      : variant === 'danger'
        ? colors.danger
        : variant === 'text'
          ? colors.primary
          : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.button,
            { minHeight: minTouch, borderRadius: radius.pill },
            filled && {
              backgroundColor: blocked ? colors.primaryDisabled : pressed ? colors.primaryPressed : colors.primary,
            },
            (variant === 'outline' || variant === 'danger') && {
              borderWidth: 1,
              borderColor: variant === 'danger' && !blocked ? colors.danger : colors.outline,
              backgroundColor: pressed ? colors.surfacePressed : colors.surface,
            },
            variant === 'text' && pressed && { backgroundColor: colors.surfacePressed },
            press.style,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={labelColor} accessibilityElementsHidden />
          ) : (
            <Text style={[type.button, { color: labelColor }]}>{title}</Text>
          )}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 10 },
});
