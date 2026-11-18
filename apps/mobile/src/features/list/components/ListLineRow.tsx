import Ionicons from '@expo/vector-icons/Ionicons';
import { displayName } from '@lazychef/core/pantry/display';
import type { ListItem } from '@lazychef/core/list/types';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { listMeta } from '@/lib/list-rows';
import { useTheme } from '@/theme';

type Props = {
  item: ListItem;
  inCart: boolean;
  /** "Checked by you" and the like, for lines in the cart. */
  detail?: string;
  /** Position in its card, to draw the card edge and corners. */
  first: boolean;
  last: boolean;
  onToggle: (item: ListItem) => void;
  onOpen: (item: ListItem) => void;
};

/** One list line: a round checkbox, then the name and details. Tapping the body opens the editor. */
export const ListLineRow = memo(function ListLineRow({ item, inCart, detail, first, last, onToggle, onOpen }: Props) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const name = displayName(item.name);
  const meta = listMeta(item, detail);

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
      }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: inCart }}
        accessibilityLabel={name}
        onPress={() => onToggle(item)}
        style={{ width: minTouch + spacing.sm, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingLeft: spacing.sm }}
      >
        <View
          style={[
            styles.box,
            inCart
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { borderColor: colors.outline },
          ]}
        >
          {inCart ? <Ionicons name="checkmark" size={18} color={colors.onPrimary} /> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}${meta ? `, ${meta}` : ''}. Edit`}
        onPress={() => onOpen(item)}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 56,
          justifyContent: 'center',
          gap: 2,
          paddingVertical: spacing.sm,
          paddingRight: spacing.lg,
          paddingLeft: spacing.xs,
          backgroundColor: pressed ? colors.surfacePressed : colors.surface,
        })}
      >
        <Text
          numberOfLines={1}
          style={[
            type.body,
            { color: inCart ? colors.muted : colors.ink },
            inCart && { textDecorationLine: 'line-through' },
          ]}
        >
          {name}
        </Text>
        {meta ? (
          <Text numberOfLines={2} style={[type.bodySmall, { color: colors.muted }]}>
            {meta}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
