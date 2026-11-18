import Ionicons from '@expo/vector-icons/Ionicons';
import { ingredientEmoji } from '@lazychef/core/ingredients/emoji';
import { displayName } from '@lazychef/core/pantry/display';
import type { PantryItem } from '@lazychef/core/pantry/types';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

export function SectionHeading({
  title,
  emoji,
  count,
  first,
}: {
  title: string;
  emoji: string | null;
  count: number;
  first: boolean;
}) {
  const { colors, spacing, type } = useTheme();
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${title}, ${count}`}
      style={[styles.heading, { paddingTop: first ? 0 : spacing.xl, paddingBottom: spacing.sm, paddingHorizontal: spacing.xs }]}
    >
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <Text style={[type.heading, { color: colors.ink }]}>{title}</Text>
      <Text style={[type.bodySmall, { color: colors.muted }]}>{count}</Text>
    </View>
  );
}

/** "Always on hand" staples as chips; tapping one opens it to edit. */
export function StapleChips({ items, onOpen }: { items: PantryItem[]; onOpen: (item: PantryItem) => void }) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  return (
    <View style={[styles.chips, { gap: spacing.sm }]}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`${displayName(item.name)}. Edit`}
          onPress={() => onOpen(item)}
          style={({ pressed }) => ({
            minHeight: minTouch,
            maxWidth: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.outline,
            backgroundColor: pressed ? colors.surfacePressed : colors.surface,
          })}
        >
          <Text style={styles.emoji}>{ingredientEmoji(item)}</Text>
          <Text numberOfLines={1} style={[type.bodySmall, { color: colors.ink, flexShrink: 1 }]}>
            {displayName(item.name)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** The "Ran out" header: tap to open or close the muted rows below. */
export function RanOutToggle({
  count,
  expanded,
  locked,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  /** True while searching: the section stays open. */
  locked: boolean;
  onToggle: () => void;
}) {
  const { colors, spacing, type, minTouch } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ran out, ${count}`}
      accessibilityState={{ expanded, disabled: locked }}
      disabled={locked}
      onPress={onToggle}
      style={{
        minHeight: minTouch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.xs,
        marginTop: spacing.md,
      }}
    >
      <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
      <Text style={[type.heading, { color: colors.muted }]}>Ran out</Text>
      <Text style={[type.bodySmall, { color: colors.muted }]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
});
