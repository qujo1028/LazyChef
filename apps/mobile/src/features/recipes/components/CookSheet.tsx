import { useQueryClient } from '@tanstack/react-query';
import { habitResult, summarize, type HabitResult } from '@lazychef/core/habit/summary';
import { syntheticCookEvent } from '@lazychef/core/habit/cook-events';
import { displayName } from '@lazychef/core/pantry/display';
import {
  haveLabel,
  initialChoices,
  ranOut,
  toDeductions,
  undoAmounts,
  type CookChoice,
  type CookLine,
  type CookResult,
} from '@lazychef/core/recipes/cook';
import { planCook } from '@lazychef/core/recipes/cook-plan';
import type { RecipeIngredient } from '@lazychef/core/recipes/recipe-shapes';
import { parseRecipeRef } from '@lazychef/core/recipes/ref';
import { formatUnit } from '@lazychef/core/units';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { Sheet } from '@/components/Sheet';
import { useToast, type ToastOptions } from '@/components/Toast';
import { RewardBurst } from '@/features/habit/components/RewardBurst';
import { useReward } from '@/features/habit/use-reward';
import { useHabit } from '@/features/habit/use-habit';
import { addListItems } from '@/features/list/api';
import { usePantry } from '@/features/pantry/pantry-provider';
import { createAfterClose, type AfterClose } from '@/lib/after-close';
import {
  addedToListMessage,
  confirmLabel,
  doneTitle,
  habitLines,
  milestoneLine,
  tookOutLines,
  tookOutSummary,
} from '@/lib/cook-done';
import { queryKeys } from '@/lib/household';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme';

import { cookRecipe, undoCook } from '../cook-api';

export type CookRecipe = {
  /** A Spoonacular id ("715538") or a local recipe uuid (see parseRecipeRef). */
  ref: string;
  title: string;
  ingredients: readonly RecipeIngredient[];
  /** Servings the ingredients are written for, if known (for scaling later). */
  servings?: number | null;
};

/**
 * "I cooked this": plans what comes out of the pantry (planCook), lets the cook fix amounts
 * or skip lines, then cook_recipe() in one transaction, with Undo (undo_cook), the reward
 * (haptic on every cook, confetti on milestones) and a done view with "Add to list" for
 * anything that ran out.
 */
export function CookSheet({ visible, onClose, recipe }: { visible: boolean; onClose: () => void; recipe: CookRecipe }) {
  const { show } = useToast();
  // Toasts render under the sheet, so they wait until it has closed.
  const [gate] = useState<AfterClose<ToastOptions>>(() => createAfterClose<ToastOptions>((t) => show(t)));

  // Each time the sheet opens, it plans again from the live pantry.
  const [opens, setOpens] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpens((n) => n + 1);
  }

  useEffect(() => {
    if (visible) gate.opened();
    // Android's Modal has no onDismiss, so release held toasts when it hides.
    else if (Platform.OS !== 'ios') gate.closed();
  }, [visible, gate]);

  const dismissed = () => {
    if (!visible) gate.closed();
  };

  return (
    <CookContent key={opens} visible={visible} onClose={onClose} onDismiss={dismissed} recipe={recipe} send={gate.send} />
  );
}

type Done = { results: CookResult[]; batchId: number; habit: HabitResult | null; undone: boolean };

function CookContent({
  visible,
  onClose,
  onDismiss,
  recipe,
  send,
}: {
  visible: boolean;
  onClose: () => void;
  onDismiss: () => void;
  recipe: CookRecipe;
  send: (toast: ToastOptions) => void;
}) {
  const { colors, spacing, type } = useTheme();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const pantry = usePantry();
  const { householdId } = pantry;
  const { events, timeZone } = useHabit(householdId);
  const { play, state: reward } = useReward();
  const today = useToday();

  // Planned once per open, so the amounts don't shift under the cook's thumbs.
  const [lines, setLines] = useState<CookLine[]>(() => planCook(recipe.ingredients, [...pantry.items.values()], today));
  const [choices, setChoices] = useState(() => initialChoices(lines));
  // If the pantry was still loading when the sheet opened, plan again once it arrives (before any edit).
  const [replanned, setReplanned] = useState(pantry.query.isSuccess);
  const [touched, setTouched] = useState(false);
  if (!replanned && pantry.query.isSuccess) {
    setReplanned(true);
    if (!touched) {
      const next = planCook(recipe.ingredients, [...pantry.items.values()], today);
      setLines(next);
      setChoices(initialChoices(next));
    }
  }
  const busy = useRef(false);
  const [showErrors, setShowErrors] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const tracked = lines.filter((l): l is Extract<CookLine, { kind: 'deduct' | 'check' }> => l.kind === 'deduct' || l.kind === 'check');
  const untracked = lines.filter((l) => l.kind === 'untracked');
  const notInPantry = lines.filter((l) => l.kind === 'missing' || l.kind === 'basic');
  const { deductions, errors } = useMemo(() => toDeductions(lines, choices), [lines, choices]);

  function set(index: number, patch: Partial<CookChoice>) {
    setTouched(true);
    setChoices((current) => ({ ...current, [index]: { ...current[index], ...patch } }));
  }

  async function refreshAfter() {
    if (!householdId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.cooks(householdId) });
    void pantry.query.refetch();
  }

  async function runUndo(results: CookResult[], batchId: number): Promise<string | null> {
    if (!householdId) return 'Pick a household first.';
    const result = await undoCook(householdId, batchId, undoAmounts(results));
    if (result.error !== undefined) return result.error;
    await refreshAfter();
    return null;
  }

  async function confirm() {
    if (busy.current || !householdId) return;
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    if (deductions.length === 0) return;
    busy.current = true;
    setPending(true);
    setFormError(null);
    const result = await cookRecipe(householdId, recipe.ref, recipe.title, deductions);
    busy.current = false;
    setPending(false);
    if (result.error !== undefined) {
      setFormError(result.error);
      return;
    }
    const { results, batchId } = result;

    // The habit before and after, worked out here from the cook rows (same math as the web action).
    let habit: HabitResult | null = null;
    const parsed = parseRecipeRef(recipe.ref);
    if (events && parsed) {
      const now = Date.now();
      habit = habitResult(summarize(events, now, timeZone), summarize([...events, syntheticCookEvent(parsed, now)], now, timeZone));
    }
    setDone({ results, batchId, habit, undone: false });
    // A milestone (tier-up, streak, finished challenge) replaces the small reward; never both.
    play(habit?.milestone ? 'milestone' : 'cook');
    void refreshAfter();

    // Held until the sheet closes. Undoing from the sheet replaces it.
    send({
      message: `Cooked ${recipe.title}`,
      action: {
        label: 'Undo',
        onPress: () => {
          void runUndo(results, batchId).then((error) => {
            show(error ? { message: error, tone: 'error' } : { message: 'Put everything back in the pantry' });
          });
        },
      },
    });
  }

  async function undoHere() {
    if (!done || busy.current) return;
    busy.current = true;
    setPending(true);
    const error = await runUndo(done.results, done.batchId);
    busy.current = false;
    setPending(false);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    setDone({ ...done, undone: true });
    send({ message: 'Put everything back in the pantry' });
  }

  const reviewFooter = (
    <View style={styles.footerFill}>
      <PrimaryPillButton
        title={pending ? 'Taking it out...' : confirmLabel(deductions.length)}
        onPress={() => void confirm()}
        loading={pending}
        disabled={deductions.length === 0}
      />
    </View>
  );
  const doneFooter = (
    <View style={[styles.footerFill, { gap: spacing.sm }]}>
      {!done?.undone ? <PrimaryPillButton title="Undo" variant="outline" onPress={() => void undoHere()} loading={pending} /> : null}
      <PrimaryPillButton title="Done" onPress={onClose} />
    </View>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      scroll={false}
      title={done ? (done.undone ? 'Put back' : doneTitle(recipe.title)) : 'I cooked this'}
      subtitle={done ? undefined : recipe.title}
      footer={done ? doneFooter : reviewFooter}
    >
      <View style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {done ? (
            <DoneBody done={done} householdId={householdId} refresh={refreshAfter} />
          ) : (
            <>
              <Text style={[type.body, { color: colors.muted }]}>
                We will take these out of the pantry. Fix an amount or skip anything you did not use.
              </Text>
              {tracked.length === 0 ? (
                <Text style={[type.body, { color: colors.ink }]}>Nothing in this recipe is tracked in your pantry.</Text>
              ) : null}
              {tracked.map((line) => (
                <CookLineCard
                  key={line.index}
                  line={line}
                  choice={choices[line.index]}
                  error={showErrors ? errors[line.index] : undefined}
                  disabled={pending}
                  onChange={(patch) => set(line.index, patch)}
                />
              ))}
              {untracked.length > 0 ? (
                <Text style={[type.bodySmall, { color: colors.muted }]}>
                  <Text style={{ color: colors.ink }}>Always on hand: </Text>
                  {untracked.map((l) => (l.kind === 'untracked' ? displayName(l.itemName) : l.name)).join(', ')}. Nothing to take out.
                </Text>
              ) : null}
              {notInPantry.length > 0 ? (
                <Text style={[type.bodySmall, { color: colors.muted }]}>
                  <Text style={{ color: colors.ink }}>Not in your pantry: </Text>
                  {notInPantry.map((l) => l.name).join(', ')}.
                </Text>
              ) : null}
            </>
          )}
          {formError ? <FormMessage tone="error" text={formError} /> : null}
          {__DEV__ ? (
            <View style={[styles.dev, { gap: spacing.sm }]}>
              <Text style={[type.meta, { color: colors.muted }]}>Dev only</Text>
              <PrimaryPillButton title="Dev: play milestone reward" variant="text" onPress={() => play('milestone')} />
              <PrimaryPillButton title="Dev: play cook reward" variant="text" onPress={() => play('cook')} />
            </View>
          ) : null}
        </ScrollView>
        <RewardBurst state={reward} />
      </View>
    </Sheet>
  );
}

function CookLineCard({
  line,
  choice,
  error,
  disabled,
  onChange,
}: {
  line: Extract<CookLine, { kind: 'deduct' | 'check' }>;
  choice: CookChoice | undefined;
  error: string | undefined;
  disabled: boolean;
  onChange: (patch: Partial<CookChoice>) => void;
}) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const skipped = choice?.skip ?? true;
  const unit = formatUnit(line.itemUnit, 2);
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: error && !skipped ? colors.danger : colors.divider,
        backgroundColor: skipped ? colors.surfacePressed : colors.surface,
      }}
    >
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={styles.fill}>
          <Text style={[type.button, { color: skipped ? colors.muted : colors.ink }]}>{displayName(line.itemName)}</Text>
          <Text style={[type.bodySmall, { color: colors.muted }]}>
            Recipe: {line.original} · {haveLabel(line)}
          </Text>
        </View>
        <View style={[styles.row, { gap: spacing.sm, minHeight: minTouch }]}>
          <Text style={[type.bodySmall, { color: colors.muted }]}>Skip</Text>
          <Switch
            value={skipped}
            onValueChange={(skip) => onChange({ skip })}
            disabled={disabled}
            accessibilityLabel={`Skip ${displayName(line.itemName)}`}
            trackColor={{ true: colors.primary, false: colors.outline }}
          />
        </View>
      </View>
      {line.kind === 'check' ? (
        <Text style={[type.bodySmall, { color: colors.accent }]}>Check this: {line.reason} Enter how much you used.</Text>
      ) : null}
      {!skipped ? (
        <View style={[styles.row, { gap: spacing.sm }]}>
          <Text style={[type.body, { color: colors.muted }]}>Take out</Text>
          <TextInput
            value={choice?.amount ?? ''}
            onChangeText={(amount) => onChange({ amount })}
            keyboardType="decimal-pad"
            returnKeyType="done"
            placeholder="Amount"
            placeholderTextColor={colors.muted}
            accessibilityLabel={`Amount of ${displayName(line.itemName)} to take out`}
            editable={!disabled}
            style={[
              type.body,
              {
                minWidth: 88,
                minHeight: minTouch,
                paddingHorizontal: spacing.md,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: colors.outline,
                color: colors.ink,
                backgroundColor: colors.background,
              },
            ]}
          />
          <Text style={[type.body, { color: colors.ink }]}>{unit || 'items'}</Text>
        </View>
      ) : null}
      {error && !skipped ? <Text style={[type.bodySmall, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

function DoneBody({
  done,
  householdId,
  refresh,
}: {
  done: Done;
  householdId: string | null;
  refresh: () => Promise<void>;
}) {
  const { colors, radius, spacing, type, minTouch } = useTheme();
  const { show } = useToast();
  const out = ranOut(done.results);
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const remaining = out.filter((item) => !added.has(item.id));
  const celebrate = milestoneLine(done.habit);
  const lines = tookOutLines(done.results);

  async function addToList(items: { id: string; name: string }[]) {
    if (!householdId || items.length === 0 || adding) return;
    setAdding(true);
    const result = await addListItems(
      householdId,
      items.map((item) => ({ name: item.name, quantity: null, unit: null })),
    );
    setAdding(false);
    if (result.error !== undefined) {
      show({ message: result.error, tone: 'error' });
      return;
    }
    setAdded((current) => new Set([...current, ...items.map((item) => item.id)]));
    show({ message: addedToListMessage(items.map((item) => item.name)) });
    void refresh();
  }

  if (done.undone) return <Text style={[type.body, { color: colors.ink }]}>Everything went back in the pantry.</Text>;

  return (
    <>
      {celebrate ? <Text style={[type.heading, { color: colors.accent }]}>{celebrate}</Text> : null}
      {habitLines(done.habit).length > 0 ? (
        <Text style={[type.button, { color: colors.ink }]}>{habitLines(done.habit).join(' · ')}</Text>
      ) : null}
      <View style={{ gap: spacing.xs }}>
        <Text style={[type.button, { color: colors.ink }]}>{tookOutSummary(done.results)}</Text>
        {lines.map((line) => (
          <Text key={line} style={[type.body, { color: colors.muted }]}>
            {line}
          </Text>
        ))}
      </View>
      {out.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={[type.heading, { color: colors.ink }]}>You ran out of</Text>
          {out.map((item) => (
            <View
              key={item.id}
              style={[
                styles.row,
                {
                  gap: spacing.sm,
                  paddingLeft: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  backgroundColor: colors.surface,
                  minHeight: minTouch + 8,
                },
              ]}
            >
              <Text style={[type.body, styles.fill, { color: colors.ink }]}>{displayName(item.name)}</Text>
              {added.has(item.id) ? (
                <Text style={[type.bodySmall, { color: colors.muted, paddingRight: spacing.md }]}>On the list</Text>
              ) : (
                <PrimaryPillButton title="Add to list" variant="text" disabled={adding} onPress={() => void addToList([item])} />
              )}
            </View>
          ))}
          {remaining.length > 1 ? (
            <PrimaryPillButton
              title={`Add all ${remaining.length} to the list`}
              variant="outline"
              disabled={adding}
              onPress={() => void addToList(remaining)}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  footerFill: { flex: 1 },
  dev: { marginTop: 8 },
});
