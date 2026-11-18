import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  title: string;
  description?: string;
  /** Trailing control next to the title, such as a "Rename" text button. */
  action?: ReactNode;
  children?: ReactNode;
};

/** The one card style on the Household tab: surface, hairline divider, large radius. */
export function SettingsCard({ title, description, action, children }: Props) {
  const { colors, radius, spacing, type } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.divider, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
      ]}
    >
      <View style={[styles.head, { gap: spacing.sm }]}>
        <View style={[styles.titles, { gap: spacing.xs }]}>
          <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
            {title}
          </Text>
          {description ? <Text style={[type.bodySmall, { color: colors.muted }]}>{description}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap' },
  titles: { flex: 1, minWidth: 160 },
});
