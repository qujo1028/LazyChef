import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

/** A form-level message (a failed sign in, "Check your email"). Announced to screen readers. */
export function FormMessage({ tone, text }: { tone: 'error' | 'success'; text: string }) {
  const { colors, radius, spacing, type } = useTheme();
  const color = tone === 'error' ? colors.danger : colors.primary;
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[
        styles.row,
        { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderColor: color, backgroundColor: colors.surface },
      ]}
    >
      <Ionicons name={tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={20} color={color} />
      <Text style={[type.bodySmall, styles.text, { color: colors.ink }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1 },
  text: { flex: 1 },
});
