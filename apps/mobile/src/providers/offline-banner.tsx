import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Colours from docs/app-design.md. TODO: move to the shared theme (src/theme) once it is merged.
const BANNER = { text: '#2A2418', background: '#E7EAD9' };

export const OFFLINE_MESSAGE = "You're offline. Showing what was saved.";

/** Slim banner that sits in the layout flow, below the status bar inset. Render only while offline. */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
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
      style={[styles.bar, { paddingTop: insets.top + 6, opacity }]}
    >
      <Text style={styles.text}>{OFFLINE_MESSAGE}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: BANNER.background,
    paddingBottom: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: { color: BANNER.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
