import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

/** The one card style: white surface, divider edge, large radius (docs/app-design.md). */
export function Card({ children }: { children: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={{
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      {children}
    </View>
  );
}
