import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { CircleIconButton } from './CircleIconButton';

type Props = {
  title: string;
  /** Shows a back button on the left when given. */
  onBack?: () => void;
  /** Trailing control, usually a CircleIconButton. */
  right?: ReactNode;
};

/** Top bar for both the tab screens (household name + Activity) and pushed screens (back + title). */
export function AppScreenHeader({ title, onBack, right }: Props) {
  const { colors, type, spacing, minTouch } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top + spacing.xs,
          paddingBottom: spacing.xs,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.background,
        },
      ]}
    >
      <View style={[styles.side, { minWidth: onBack ? minTouch : 0 }]}>
        {onBack ? <CircleIconButton icon="chevron-back" label="Back" onPress={onBack} /> : null}
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={[type.heading, styles.title, { color: colors.ink, textAlign: onBack ? 'center' : 'left' }]}
      >
        {title}
      </Text>
      <View style={[styles.side, { minWidth: onBack || right ? minTouch : 0, alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  side: { justifyContent: 'center' },
  title: { flex: 1, paddingHorizontal: 4 },
});
