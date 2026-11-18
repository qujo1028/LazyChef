import { expiryInfo, timeAgo } from '@lazychef/core/dates/days';
import { ingredientEmoji } from '@lazychef/core/ingredients/emoji';
import { addedByLabel, amountLabel, categoryLabel, displayName, remainingMessage, shortDate } from '@lazychef/core/pantry/display';
import { changedFields, formFromItem, itemFormErrors, usedAmount, type ItemForm } from '@lazychef/core/pantry/item-form';
import type { PantryItem } from '@lazychef/core/pantry/types';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useToast, type ToastOptions } from '@/components/Toast';
import { useHouseholdMembers } from '@/features/household/api';
import { createAfterClose, type AfterClose } from '@/lib/after-close';
import { useSession } from '@/lib/use-session';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme';

import { deleteItem, updateItem } from '../api';
import { usePantry, usePantryItem } from '../pantry-provider';
import { CategoryField, ExpiryField, UnitField } from './PantryFields';

/**
 * Tap an item: fix its name, amount, unit, category or expiry, mark it always on hand,
 * "Used some", "We ran out", or delete it. Reads the live row by id (null once a housemate
 * deletes it, then says so).
 */
export function EditItemSheet({ itemId, visible, onClose }: { itemId: string | null; visible: boolean; onClose: () => void }) {
  const item = usePantryItem(itemId);
  const { show } = useToast(); // stable, so the gate can keep it

  // Toasts render under the sheet, so they wait until it has closed.
  const [gate] = useState<AfterClose<ToastOptions>>(() => createAfterClose<ToastOptions>((t) => show(t)));

  // Keep showing the last version while the sheet slides away (or after a housemate deletes it).
  const [shown, setShown] = useState<PantryItem | null>(item);
  if (item && item !== shown) setShown(item);
  const current = item ?? shown;

  // Each time the sheet opens, the form starts fresh.
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

  if (!current) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Item">
        <View />
      </Sheet>
    );
  }
  return (
    <EditItemContent
      key={`${current.id}-${opens}`}
      item={current}
      visible={visible}
      gone={visible && item === null}
      close={onClose}
      send={gate.send}
      onDismiss={gate.closed}
    />
  );
}

function EditItemContent({
  item,
  visible,
  gone,
  close,
  send,
  onDismiss,
}: {
  item: PantryItem;
  visible: boolean;
  gone: boolean;
  close: () => void;
  send: (toast: ToastOptions) => void;
  onDismiss: () => void;
}) {
  const { colors, spacing, type } = useTheme();
  const { householdId, apply, adjust } = usePantry();
  const { session } = useSession();
  const membersQuery = useHouseholdMembers(householdId);
  const members = useMemo(
    () => (membersQuery.data ?? []).map((m) => ({ userId: m.userId, displayName: m.displayName })),
    [membersQuery.data],
  );
  const today = useToday();
  const [now] = useState(() => Date.now());

  const [initial] = useState(() => formFromItem(item));
  const [form, setForm] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const name = displayName(item.name);
  const errors = itemFormErrors(form);
  const shownErrors = showErrors ? errors : {};
  const dirty = (Object.keys(initial) as (keyof ItemForm)[]).some((key) => form[key] !== initial[key]);
  const set = (patch: Partial<ItemForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setMessage(null);
  };
  const inStock = item.quantity !== null && item.quantity > 0 && !item.is_staple;
  const expiry = form.expiresOn ? expiryInfo(form.expiresOn, today) : null;

  async function save() {
    if (pending || gone || !householdId) return;
    if (errors.name || errors.quantity) {
      setShowErrors(true);
      return;
    }
    const fields = changedFields(initial, form);
    if (Object.keys(fields).length === 0) {
      close();
      return;
    }
    const before = item;
    setPending(true);
    setMessage(null);
    apply({ type: 'patch', id: item.id, fields });
    const result = await updateItem(householdId, item.id, fields);
    setPending(false);
    if (result.error !== undefined) {
      apply({ type: 'upsert', item: before });
      setMessage(result.error);
      return;
    }
    apply({ type: 'upsert', item: result.item });
    close();
    send({ message: `Saved ${displayName(result.item.name)}` });
  }

  async function markRanOut() {
    if (!householdId) return;
    const before = item;
    apply({ type: 'patch', id: item.id, fields: { quantity: 0 } });
    close();
    const result = await updateItem(householdId, item.id, { quantity: 0 });
    if (result.error !== undefined) {
      apply({ type: 'upsert', item: before });
      send({ message: result.error, tone: 'error' });
      return;
    }
    apply({ type: 'upsert', item: result.item });
    send({ message: `Moved ${item.name.trim()} to Ran out` });
  }

  function confirmDelete() {
    if (pending) return;
    Alert.alert(`Delete ${name}?`, "It's removed from the pantry for everyone in your household.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ]);
  }

  async function remove() {
    if (!householdId) return;
    setPending(true);
    setMessage(null);
    const result = await deleteItem(householdId, item.id);
    setPending(false);
    if (result.error !== undefined) {
      setMessage(result.error);
      return;
    }
    close();
    apply({ type: 'remove', id: item.id });
    send({ message: `Deleted ${item.name.trim()}` });
  }

  const footer = gone ? undefined : (
    <>
      <PrimaryPillButton title="Delete" variant="danger" accessibilityLabel={`Delete ${name}`} disabled={pending} onPress={confirmDelete} />
      <View style={styles.fill}>
        <PrimaryPillButton
          title={pending ? 'Saving...' : 'Save changes'}
          loading={pending}
          disabled={!dirty}
          onPress={() => void save()}
        />
      </View>
    </>
  );

  return (
    <Sheet
      visible={visible}
      onClose={close}
      onDismiss={onDismiss}
      title={name}
      subtitle={`${amountLabel(item)} · ${categoryLabel(item.category)}`}
      leading={
        <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.emoji}>
          {ingredientEmoji(item)}
        </Text>
      }
      footer={footer}
    >
      <Text style={[type.bodySmall, { color: colors.muted }]}>
        {addedByLabel(item.created_by, members, session?.user.id ?? '')} · {timeAgo(item.created_at, now)}
      </Text>

      {gone ? (
        <View style={{ gap: spacing.md }}>
          <FormMessage tone="error" text="Someone in your household just removed this item." />
          <PrimaryPillButton title="Close" variant="outline" onPress={close} />
        </View>
      ) : (
        <>
          {message ? <FormMessage tone="error" text={message} /> : null}

          {inStock ? (
            <UsedSome
              item={item}
              onUse={(delta) => {
                adjust(item.id, delta, {
                  onDone: (quantity) => send({ message: remainingMessage(item.name, quantity, item.unit) }),
                  onError: (error) => send({ message: error, tone: 'error' }),
                });
                close();
              }}
            />
          ) : null}

          {item.quantity === null && !item.is_staple ? (
            <PrimaryPillButton title="We ran out" variant="outline" onPress={() => void markRanOut()} />
          ) : null}

          <TextField
            label="Name"
            value={form.name}
            onChangeText={(text) => set({ name: text })}
            maxLength={80}
            autoComplete="off"
            returnKeyType="done"
            error={shownErrors.name}
          />

          <View style={{ gap: spacing.xs }}>
            <View style={[styles.row, { gap: spacing.sm }]}>
              <View style={styles.amount}>
                <TextField
                  label="Amount"
                  value={form.quantity}
                  onChangeText={(text) => set({ quantity: text })}
                  keyboardType="decimal-pad"
                  placeholder="On hand"
                  autoComplete="off"
                  error={shownErrors.quantity}
                />
              </View>
              <View style={styles.fill}>
                <UnitField label="Unit" value={form.unit} onChange={(unit) => set({ unit })} />
              </View>
            </View>
            <Text style={[type.bodySmall, { color: colors.muted }]}>Leave it empty for things you don&apos;t count.</Text>
          </View>

          <CategoryField
            value={form.category}
            onChange={(category) => set({ category })}
            hint={form.category !== initial.category ? "We'll remember this for next time." : undefined}
          />

          <View style={{ gap: spacing.xs }}>
            <ExpiryField value={form.expiresOn} onChange={(expiresOn) => set({ expiresOn })} today={today} />
            {expiry ? (
              <Text style={[type.bodySmall, { color: colors.muted }]}>
                {expiry.label} · {shortDate(form.expiresOn)}
              </Text>
            ) : null}
          </View>

          <View style={[styles.row, styles.between, { gap: spacing.md, minHeight: 44 }]}>
            <View style={styles.fill}>
              <Text style={[type.body, styles.label, { color: colors.ink }]}>Always on hand</Text>
              <Text style={[type.bodySmall, { color: colors.muted }]}>
                For basics like salt: they count for recipes and aren&apos;t tracked.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Always on hand"
              value={form.isStaple}
              onValueChange={(isStaple) => set({ isStaple })}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}

/** "Used some": an amount in any unit, converted to the item's. */
function UsedSome({ item, onUse }: { item: PantryItem; onUse: (delta: number) => void }) {
  const { colors, radius, spacing, type } = useTheme();
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState(item.unit);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const result = usedAmount(amount, unit, item.unit);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onUse(result.delta);
  }

  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface }}>
      <Text style={[type.body, styles.label, { color: colors.ink }]}>Used some?</Text>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <View style={styles.amount}>
          <TextField
            label="How much"
            value={amount}
            onChangeText={(text) => {
              setAmount(text);
              setError(null);
            }}
            keyboardType="decimal-pad"
            placeholder="How much"
            autoComplete="off"
            returnKeyType="done"
            onSubmitEditing={submit}
            error={error}
          />
        </View>
        <View style={styles.fill}>
          <UnitField
            label="Unit used"
            value={unit}
            onChange={(next) => {
              setUnit(next);
              setError(null);
            }}
          />
        </View>
      </View>
      <PrimaryPillButton title="Use" disabled={!amount.trim()} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  amount: { width: 112 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  between: { alignItems: 'center' },
  label: { fontFamily: 'SourceSans3_600SemiBold' },
  emoji: { fontSize: 28 },
});
