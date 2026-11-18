import Ionicons from '@expo/vector-icons/Ionicons';
import { ingredientEmoji } from '@lazychef/core/ingredients/emoji';
import { displayName } from '@lazychef/core/pantry/display';
import { CATEGORY_SOURCE_HINT, draftError, type ReviewDraft } from '@lazychef/core/pantry/review';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { TextField } from '@/components/TextField';
import { useTheme } from '@/theme';

import { CategoryField, ExpiryField, UnitField } from './PantryFields';

/**
 * "Check it before adding": one card per draft (name, amount and unit, category with the
 * "we'll remember" hint, expiry, always-on-hand switch, remove). Same rules as the web
 * app's src/features/pantry/components/review-list.tsx. Removing the last card calls
 * onChange([]); the parent then goes back to typing.
 *
 * A plain map (no FlatList), so it scrolls inside the Sheet's ScrollView without nesting
 * virtualized lists.
 */
export function ReviewList({
  drafts,
  onChange,
  today,
  showErrors,
  disabled,
  hints,
}: {
  drafts: readonly ReviewDraft[];
  onChange: (drafts: ReviewDraft[]) => void;
  today: string;
  /** Show field errors (after a failed Add). */
  showErrors: boolean;
  disabled?: boolean;
  /** Per draft key, a note under the card (put away: "Adds to your milk (1 gal now)"). */
  hints?: ReadonlyMap<string, string>;
}) {
  const { spacing } = useTheme();
  return (
    <View accessibilityLabel="Items to add" style={{ gap: spacing.md }}>
      {drafts.map((draft) => (
        <ReviewItemCard
          key={draft.key}
          draft={draft}
          today={today}
          showErrors={showErrors}
          disabled={disabled}
          note={hints?.get(draft.key)}
          onChange={(next) => onChange(drafts.map((d) => (d.key === draft.key ? next : d)))}
          onRemove={() => onChange(drafts.filter((d) => d.key !== draft.key))}
        />
      ))}
    </View>
  );
}

function ReviewItemCard({
  draft,
  today,
  showErrors,
  disabled,
  onChange,
  onRemove,
  note,
}: {
  draft: ReviewDraft;
  note?: string;
  today: string;
  showErrors: boolean;
  disabled?: boolean;
  onChange: (draft: ReviewDraft) => void;
  onRemove: () => void;
}) {
  const { colors, spacing, type, minTouch } = useTheme();
  const errors = showErrors ? draftError(draft) : {};
  const label = draft.name.trim() ? displayName(draft.name) : 'this item';
  const changed = draft.category !== draft.suggestedCategory;
  const hint = changed ? "We'll remember this for next time." : CATEGORY_SOURCE_HINT[draft.categorySource];
  const set = (patch: Partial<ReviewDraft>) => onChange({ ...draft, ...patch });

  return (
    <Card>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.emoji}>
          {ingredientEmoji(draft)}
        </Text>
        <View style={styles.fill}>
          <TextField
            label="Name"
            value={draft.name}
            // Renaming drops the ingredient id in draftToItem (it compares with resolvedName).
            onChangeText={(name) => set({ name })}
            maxLength={80}
            autoCorrect={false}
            editable={!disabled}
            error={errors.name}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          disabled={disabled}
          onPress={onRemove}
          style={({ pressed }) => [
            styles.remove,
            { minWidth: minTouch, minHeight: minTouch, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
          ]}
        >
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>

      <View style={[styles.row, { gap: spacing.sm }]}>
        <View style={styles.amount}>
          <TextField
            label="Amount"
            placeholder="Qty"
            value={draft.quantity}
            onChangeText={(quantity) => set({ quantity })}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            autoCorrect={false}
            editable={!disabled}
            error={errors.quantity}
          />
        </View>
        <View style={styles.fill}>
          <UnitField value={draft.unit} onChange={(unit) => set({ unit })} disabled={disabled} />
        </View>
      </View>

      <CategoryField value={draft.category} onChange={(category) => set({ category })} hint={hint} disabled={disabled} />

      <ExpiryField
        value={draft.expiresOn}
        onChange={(expiresOn) => set({ expiresOn })}
        today={today}
        label={`${label} expires`}
        disabled={disabled}
      />

      <View style={[styles.switchRow, { minHeight: minTouch }]}>
        <Text style={[type.body, { color: colors.ink }]}>Always on hand</Text>
        <Switch
          accessibilityLabel={`${label}: always on hand`}
          value={draft.isStaple}
          onValueChange={(isStaple) => set({ isStaple })}
          disabled={disabled}
          trackColor={{ false: colors.outline, true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>
      {note ? <Text style={[type.bodySmall, { color: colors.primary }]}>{note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  fill: { flex: 1 },
  amount: { width: 96 },
  emoji: { fontSize: 24, lineHeight: 30, width: 30, textAlign: 'center', paddingTop: 26 },
  remove: { alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
