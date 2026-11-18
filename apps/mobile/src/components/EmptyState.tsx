import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

/** Placeholder body for screens whose features have not landed yet. */
export function EmptyState({ title, line }: { title: string; line: string }) {
  const { colors, type, spacing } = useTheme();
  return (
    <View style={[styles.wrap, { gap: spacing.sm }]}>
      <Text accessibilityRole="header" style={[type.title, { color: colors.ink }]}>
        {title}
      </Text>
      <Text style={[type.body, { color: colors.muted }]}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { paddingTop: 8 } });
