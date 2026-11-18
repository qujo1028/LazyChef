import { ingredientEmoji } from '@lazychef/core/ingredients/emoji';
import { displayName } from '@lazychef/core/pantry/display';
import { describeAdditions } from '@lazychef/core/pantry/merge';
import { COMMON_STAPLES } from '@lazychef/core/pantry/staples';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useToast } from '@/components/Toast';
import { useTheme } from '@/theme';

import { addStaples } from '../api';

type Props = {
  householdId: string;
  onlyStaples: boolean;
  /** Lowercased names already in the pantry. */
  existingNames: ReadonlySet<string>;
  onAddFood: () => void;
};

/** The empty pantry: what this is, an "Add food" button, and one-tap kitchen basics. */
export function GettingStarted({ householdId, onlyStaples, existingNames, onAddFood }: Props) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const toast = useToast();
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());

  const isAdded = (name: string) => existingNames.has(name.trim().toLowerCase()) || added.has(name);
  const remaining = COMMON_STAPLES.map((s) => s.name).filter((name) => !isAdded(name) && !pending.has(name));

  async function add(names: string[]) {
    if (names.length === 0) return;
    setPending((current) => new Set([...current, ...names]));
    const result = await addStaples(householdId, names);
    setPending((current) => new Set([...current].filter((name) => !names.includes(name))));
    if (result.error !== undefined) {
      toast.error(result.error);
      return;
    }
    setAdded((current) => new Set([...current, ...names]));
    toast.show({ message: names.length === 1 ? `Added ${displayName(names[0])}` : describeAdditions(result) });
  }

  return (
    <Card>
      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
          {onlyStaples ? 'Now add your food' : 'Your pantry is empty'}
        </Text>
        <Text style={[type.body, { color: colors.muted }]}>
          Add what is in your fridge and cupboards, like &ldquo;2 lbs chicken breast&rdquo; or &ldquo;1 dozen
          eggs&rdquo;. Everyone in your household shares this pantry.
        </Text>
      </View>
      <PrimaryPillButton title="Add food" onPress={onAddFood} />

      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />

      <View style={{ gap: spacing.sm }}>
        <Text style={[type.heading, { color: colors.ink }]}>Kitchen basics</Text>
        <Text style={[type.bodySmall, { color: colors.muted }]}>
          Tap the ones you always have. They count for recipes and never need restocking here.
        </Text>
      </View>
      <View style={[styles.chips, { gap: spacing.sm }]}>
        {COMMON_STAPLES.map((staple) => {
          const done = isAdded(staple.name);
          const busy = pending.has(staple.name);
          return (
            <Pressable
              key={staple.name}
              accessibilityRole="button"
              accessibilityLabel={done ? `${displayName(staple.name)}, added` : `Add ${staple.name}`}
              accessibilityState={{ disabled: done || busy }}
              disabled={done || busy}
              onPress={() => void add([staple.name])}
              style={({ pressed }) => ({
                minHeight: minTouch,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.pill,
                borderWidth: done ? 2 : 1,
                borderColor: done ? colors.primary : colors.outline,
                backgroundColor: done || pressed ? colors.surfacePressed : colors.surface,
                opacity: busy ? 0.6 : 1,
              })}
            >
              <Text style={styles.emoji}>{ingredientEmoji(staple)}</Text>
              <Text style={[type.bodySmall, { color: colors.ink }]}>{displayName(staple.name)}</Text>
              <Text style={[type.bodySmall, { color: done ? colors.primary : colors.muted }]}>{done ? '✓' : '+'}</Text>
            </Pressable>
          );
        })}
      </View>
      {remaining.length > 1 ? (
        <PrimaryPillButton title={`Add these ${remaining.length}`} variant="outline" onPress={() => void add(remaining)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  emoji: { fontSize: 18 },
});
