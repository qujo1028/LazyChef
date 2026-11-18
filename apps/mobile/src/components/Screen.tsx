import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = {
  children: ReactNode;
  /** True (default) on tab screens: the tab navigator lays the tab bar out below the content, so
   *  nothing sits under it. Pass false on pushed screens to add the bottom safe-area inset instead. */
  belowTabBar?: boolean;
  /** False for screens that manage their own scrolling. */
  scroll?: boolean;
};

/** Background colour, side padding and bottom safe area. */
export function Screen({ children, belowTabBar = true, scroll = true }: Props) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = spacing.xl + (belowTabBar ? 0 : insets.bottom);
  const padding = { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: bottom };
  if (!scroll) {
    return <View style={[styles.fill, padding, { backgroundColor: colors.background }]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.fill, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.grow, padding]}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 }, grow: { flexGrow: 1 } });
