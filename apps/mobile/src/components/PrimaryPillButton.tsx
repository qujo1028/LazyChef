import { Pressable, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/hooks/use-press-scale';
import { useTheme } from '@/theme';

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function PrimaryPillButton({ title, onPress, disabled = false, accessibilityLabel }: Props) {
  const { colors, radius, type, minTouch } = useTheme();
  const press = usePressScale(0.97);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.button,
            {
              minHeight: minTouch,
              borderRadius: radius.pill,
              backgroundColor: disabled
                ? colors.primaryDisabled
                : pressed
                  ? colors.primaryPressed
                  : colors.primary,
            },
            press.style,
          ]}
        >
          <Text style={[type.button, { color: colors.onPrimary }]}>{title}</Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 10 },
});
