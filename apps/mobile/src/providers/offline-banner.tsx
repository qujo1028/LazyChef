import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export const OFFLINE_MESSAGE = "You're offline. Showing what was saved.";

/** Slim banner that sits in the layout flow, below the status bar inset. Render only while offline. */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) opacity.setValue(1);
      else Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [opacity]);

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.bar, { paddingTop: insets.top + 6, opacity, backgroundColor: colors.pill }]}
    >
      <Text style={[styles.text, { color: colors.ink }]}>{OFFLINE_MESSAGE}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingBottom: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
