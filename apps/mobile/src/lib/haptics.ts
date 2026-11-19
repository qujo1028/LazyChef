// The shared haptic kinds (packages/core/src/haptics/kinds.ts) mapped to expo-haptics, the same
// way the web app maps them to the Capacitor plugin. Never throws; does nothing on Expo web.
import type { HapticKind } from '@lazychef/core/haptics/kinds';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type { HapticKind };

export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web') return;
  const run = () => {
    switch (kind) {
      case 'tap':
        return Haptics.selectionAsync();
      case 'light':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case 'rise':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      case 'success':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case 'milestone':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  };
  try {
    void run()?.catch(() => {});
  } catch {
    // No haptics on this device.
  }
}
