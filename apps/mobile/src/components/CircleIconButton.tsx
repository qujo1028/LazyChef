import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/hooks/use-press-scale';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon: IconName;
  /** Spoken label. Required: the button has no visible text. */
  label: string;
  onPress: () => void;
  size?: number;
};

export function CircleIconButton({ icon, label, onPress, size = 44 }: Props) {
  const { colors, minTouch } = useTheme();
  const press = usePressScale(0.92);
  const box = Math.max(size, minTouch);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={4}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.circle,
            {
              width: box,
              height: box,
              borderRadius: box / 2,
              backgroundColor: pressed ? colors.surfacePressed : colors.surface,
              borderColor: colors.divider,
            },
            press.style,
          ]}
        >
          <Ionicons name={icon} size={22} color={colors.ink} />
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
