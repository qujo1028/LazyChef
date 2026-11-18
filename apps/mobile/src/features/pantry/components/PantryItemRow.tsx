import { expiryInfo } from '@lazychef/core/dates/days';
import { ingredientEmoji } from '@lazychef/core/ingredients/emoji';
import { amountLabel, canUseOne, displayName } from '@lazychef/core/pantry/display';
import type { PantryItem } from '@lazychef/core/pantry/types';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  item: PantryItem;
  today: string;
  showEmoji: boolean;
  muted: boolean;
  /** Position in its card, to draw the card edge and corners. */
  first: boolean;
  last: boolean;
  onOpen: (item: PantryItem) => void;
  onUseOne: (item: PantryItem) => void;
};

/** One pantry row: name, amount, expiry badge, and a "-1" button. Rows stack into the one card style. */
export const PantryItemRow = memo(function PantryItemRow({ item, today, showEmoji, muted, first, last, onOpen, onUseOne }: Props) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const name = displayName(item.name);
  const expiry = expiryInfo(item.expires_on, today);
  const badge = expiry && expiry.tone !== 'later' && !muted ? expiry : null;
  const amount = amountLabel(item);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderColor: colors.divider,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: first ? 1 : StyleSheet.hairlineWidth,
        borderBottomWidth: last ? 1 : 0,
        borderTopLeftRadius: first ? radius.lg : 0,
        borderTopRightRadius: first ? radius.lg : 0,
        borderBottomLeftRadius: last ? radius.lg : 0,
        borderBottomRightRadius: last ? radius.lg : 0,
        overflow: 'hidden',
        paddingRight: spacing.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${amount}${badge ? `, ${badge.label}` : ''}. Edit`}
        onPress={() => onOpen(item)}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm,
          paddingLeft: spacing.lg,
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        })}
      >
        {showEmoji ? (
          <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.emoji}>
            {ingredientEmoji(item)}
          </Text>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={[type.body, { color: muted ? colors.muted : colors.ink }]}>
            {name}
          </Text>
          <View style={styles.meta}>
            <Text style={[type.bodySmall, { color: colors.muted }]}>{amount}</Text>
            {badge ? (
              <Text
                style={[
                  type.meta,
                  styles.badge,
                  {
                    borderRadius: radius.pill,
                    backgroundColor: colors.pill,
                    color: badge.tone === 'expired' ? colors.danger : colors.accent,
                  },
                ]}
              >
                {badge.label}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      {canUseOne(item) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Use one ${name}`}
          onPress={() => onUseOne(item)}
          hitSlop={4}
          style={({ pressed }) => ({
            width: minTouch,
            height: minTouch,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.outline,
            backgroundColor: pressed ? colors.surfacePressed : colors.surface,
          })}
        >
          <Text style={[type.button, { color: colors.ink }]}>{'−1'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  emoji: { fontSize: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, rowGap: 2 },
  badge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },
});
