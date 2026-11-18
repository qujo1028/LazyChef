import { ingredientEmoji } from '@lazychef/core/ingredients/emoji';
import { CATEGORY_META, type CatalogEntry } from '@lazychef/core/ingredients/types';
import { matchRange } from '@lazychef/core/pantry/suggest';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { highlightParts } from '@/lib/add-food';
import { useTheme } from '@/theme';

/** Ingredient suggestions under the add-food box. The typed part of each name is bold. */
export function SuggestionList({
  suggestions,
  query,
  onPick,
}: {
  suggestions: readonly CatalogEntry[];
  query: string;
  onPick: (entry: CatalogEntry) => void;
}) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  if (suggestions.length === 0) return null;
  return (
    <View
      accessibilityLabel="Suggestions"
      style={{
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.outline,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {suggestions.map((entry, index) => {
        const meta = CATEGORY_META[entry.category] ?? CATEGORY_META.other;
        const parts = highlightParts(entry.name, matchRange(entry.name, query));
        return (
          <Pressable
            key={entry.name}
            accessibilityRole="button"
            accessibilityLabel={`${entry.name}, ${meta.label}`}
            onPress={() => onPick(entry)}
            style={({ pressed }) => [
              styles.row,
              {
                minHeight: minTouch,
                gap: spacing.md,
                paddingHorizontal: spacing.md,
                backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: colors.divider,
              },
            ]}
          >
            <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.emoji}>
              {ingredientEmoji(entry)}
            </Text>
            <Text numberOfLines={1} style={[type.body, styles.name, { color: colors.ink }]}>
              {parts.before}
              {parts.match ? <Text style={styles.bold}>{parts.match}</Text> : null}
              {parts.after}
            </Text>
            <Text style={[type.bodySmall, { color: colors.muted }]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  emoji: { fontSize: 22 },
  name: { flex: 1 },
  bold: { fontFamily: 'SourceSans3_700Bold' },
});
