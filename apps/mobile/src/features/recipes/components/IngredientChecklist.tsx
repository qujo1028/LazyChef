import Ionicons from '@expo/vector-icons/Ionicons';
import { displayName } from '@lazychef/core/pantry/display';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { addButtonLabel, defaultSelection, type ChecklistLine } from '@/lib/recipe-view';
import { useTheme } from '@/theme';

/**
 * The recipe's ingredients against the live pantry: "You need" with boxes to pick what goes on
 * the shopping list, then "You have" (pantry items and basics like salt).
 */
export function IngredientChecklist({
  lines,
  adding,
  onAdd,
}: {
  lines: readonly ChecklistLine[];
  adding: boolean;
  /** Called with the chosen ingredient positions. */
  onAdd: (chosen: number[]) => void;
}) {
  const { colors, spacing, type } = useTheme();
  const needLines = lines.filter((line) => line.status === 'need');
  const haveLines = lines.filter((line) => line.status !== 'need');
  const addable = needLines.filter((line) => !line.onList);

  // Missing, not optional, not already on the list. Picks the person made win over later pantry changes.
  const [picks, setPicks] = useState<ReadonlyMap<number, boolean>>(() => new Map());
  const isPicked = (line: ChecklistLine) => picks.get(line.index) ?? defaultSelection([line]).length > 0;
  const chosen = addable.filter(isPicked).map((line) => line.index);

  function toggle(line: ChecklistLine) {
    setPicks((current) => new Map(current).set(line.index, !isPicked(line)));
  }

  return (
    <View style={{ gap: spacing.lg }}>
      {needLines.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.button, { color: colors.accent }]}>
            You need <Text style={{ color: colors.muted }}>· {needLines.length}</Text>
          </Text>
          <Group>
            {needLines.map((line, i) => (
              <NeedRow
                key={line.index}
                line={line}
                first={i === 0}
                picked={isPicked(line)}
                onToggle={() => toggle(line)}
              />
            ))}
          </Group>
          {addable.length > 0 ? (
            <PrimaryPillButton
              title={adding ? 'Adding...' : addButtonLabel(chosen.length, addable.length)}
              loading={adding}
              disabled={chosen.length === 0}
              onPress={() => onAdd(chosen)}
            />
          ) : null}
        </View>
      ) : null}

      {haveLines.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.button, { color: colors.primary }]}>
            You have <Text style={{ color: colors.muted }}>· {haveLines.length}</Text>
          </Text>
          <Group>
            {haveLines.map((line, i) => (
              <Row key={line.index} first={i === 0}>
                <View style={[styles.badge, { backgroundColor: colors.pill }]}>
                  <Ionicons name="checkmark" size={16} color={colors.primary} />
                </View>
                <View style={styles.text}>
                  <Text style={[type.body, { color: colors.ink }]}>{line.original}</Text>
                  <Text style={[type.bodySmall, { color: colors.muted }]}>
                    {line.status === 'basic'
                      ? 'Pantry basic'
                      : `You have ${line.pantryName ? displayName(line.pantryName).toLowerCase() : 'it'}`}
                  </Text>
                </View>
              </Row>
            ))}
          </Group>
        </View>
      ) : null}
    </View>
  );
}

function Group({ children }: { children: ReactNode }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.divider,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function Row({ children, first }: { children: ReactNode; first: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.row,
        {
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: colors.divider,
        },
      ]}
    >
      {children}
    </View>
  );
}

function NeedRow({ line, first, picked, onToggle }: { line: ChecklistLine; first: boolean; picked: boolean; onToggle: () => void }) {
  const { colors, spacing, type } = useTheme();
  const note = line.onList ? 'On the shopping list' : line.optional ? 'Optional' : null;
  if (line.onList) {
    return (
      <Row first={first}>
        <View style={[styles.badge, { backgroundColor: colors.pill }]}>
          <Ionicons name="list" size={14} color={colors.muted} />
        </View>
        <View style={styles.text}>
          <Text style={[type.body, { color: colors.ink }]}>{line.original}</Text>
          <Text style={[type.bodySmall, { color: colors.muted }]}>{note}</Text>
        </View>
      </Row>
    );
  }
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={`Add ${line.name} to the shopping list`}
      onPress={onToggle}
    >
      {({ pressed }) => (
        <View style={{ backgroundColor: pressed ? colors.surfacePressed : colors.surface }}>
          <Row first={first}>
            <View
              style={[
                styles.box,
                picked ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.outline },
              ]}
            >
              {picked ? <Ionicons name="checkmark" size={18} color={colors.onPrimary} /> : null}
            </View>
            <View style={[styles.text, { paddingRight: spacing.sm }]}>
              <Text style={[type.body, { color: colors.ink }]}>{line.original}</Text>
              {note ? <Text style={[type.bodySmall, { color: colors.muted }]}>{note}</Text> : null}
            </View>
          </Row>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 8 },
  text: { flex: 1, gap: 2 },
  box: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
