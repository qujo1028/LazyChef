import { timeAgo } from '@lazychef/core/dates/days';
import { checkedByLabel } from '@lazychef/core/list/display';
import { listChangedFields, listFormErrors, listFormFromItem, type ListItemForm } from '@lazychef/core/list/item-form';
import type { ListItem } from '@lazychef/core/list/types';
import { displayName } from '@lazychef/core/pantry/display';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useToast, type ToastOptions } from '@/components/Toast';
import { useHouseholdMembers } from '@/features/household/api';
import { CategoryField, UnitField } from '@/features/pantry/components/PantryFields';
import { createAfterClose, type AfterClose } from '@/lib/after-close';
import { listSubtitle, undoLine } from '@/lib/list-edit';
import { useSession } from '@/lib/use-session';
import { useTheme } from '@/theme';

import { addListItems, deleteListItems, updateListItem } from '../api';
import { useList, useListItem } from '../list-provider';

/**
 * Tap a line: fix its name, amount and unit, aisle (category) or note, or delete it with
 * Undo. Reads the live line by id (null once a housemate deletes it or puts it away).
 */
export function ListEditSheet({ itemId, visible, onClose }: { itemId: string | null; visible: boolean; onClose: () => void }) {
  const item = useListItem(itemId);
  const { show } = useToast();

  // Toasts render under the sheet, so they wait until it has closed.
  const [gate] = useState<AfterClose<ToastOptions>>(() => createAfterClose<ToastOptions>((t) => show(t)));

  // Keep showing the last version while the sheet slides away (or after a housemate removes it).
  const [shown, setShown] = useState<ListItem | null>(item);
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

  // A late dismiss from an earlier sheet must not release toasts while this one is open.
  const dismissed = () => {
    if (!visible) gate.closed();
  };

  if (!current) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Item" onDismiss={dismissed}>
        <View />
      </Sheet>
    );
  }
  return (
    <ListEditContent
      key={`${current.id}-${opens}`}
      item={current}
      live={item}
      visible={visible}
      gone={visible && item === null}
      close={onClose}
      send={gate.send}
      onDismiss={dismissed}
    />
  );
}

const REMOVED = 'Someone already removed that item.';

function ListEditContent({
  item,
  live,
  visible,
  gone,
  close,
  send,
  onDismiss,
}: {
  item: ListItem;
  live: ListItem | null;
  visible: boolean;
  gone: boolean;
  close: () => void;
  send: (toast: ToastOptions) => void;
  onDismiss: () => void;
}) {
  const { colors, spacing, type } = useTheme();
  const { householdId, apply, setItemChecked } = useList();
  const { session } = useSession();
  const membersQuery = useHouseholdMembers(householdId);
  const members = useMemo(
    () => (membersQuery.data ?? []).map((m) => ({ userId: m.userId, displayName: m.displayName })),
    [membersQuery.data],
  );
  const [now] = useState(() => Date.now());

  const [initial] = useState(() => listFormFromItem(item));
  const [form, setForm] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const name = displayName(item.name);
  const errors = listFormErrors(form);
  const shownErrors = showErrors ? errors : {};
  // Whitespace-only edits don't count: they save nothing.
  const valid = !errors.name && !errors.quantity && !errors.note;
  const dirty = valid ? Object.keys(listChangedFields(initial, form)).length > 0 : (Object.keys(initial) as (keyof ListItemForm)[]).some((key) => form[key] !== initial[key]);
  const set = (patch: Partial<ListItemForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setMessage(null);
  };
  // The live row: it flips when someone checks the line while the sheet is open.
  const checked = (live ?? item).checked_at !== null;

  async function save() {
    if (pending || gone || !householdId) return;
    if (errors.name || errors.quantity || errors.note) {
      setShowErrors(true);
      return;
    }
    const fields = listChangedFields(initial, form);
    if (Object.keys(fields).length === 0) {
      close();
      return;
    }
    const before = item;
    setPending(true);
    setMessage(null);
    apply({ type: 'patch', id: item.id, fields });
    const result = await updateListItem(householdId, item.id, fields);
    setPending(false);
    if (result.error !== undefined) {
      // A housemate removed it: don't bring it back.
      apply(result.error === REMOVED ? { type: 'remove', id: item.id } : { type: 'upsert', item: before });
      setMessage(result.error);
      return;
    }
    apply({ type: 'upsert', item: result.item });
    close();
    send({ message: `Saved ${displayName(result.item.name)}` });
  }

  async function remove() {
    if (pending || gone || !householdId) return;
    setPending(true);
    setMessage(null);
    const result = await deleteListItems(householdId, [item.id]);
    setPending(false);
    if (result.error !== undefined) {
      setMessage(result.error);
      return;
    }
    // Close first, so the sheet never shows "someone removed this" for our own delete.
    close();
    apply({ type: 'remove', id: item.id });
    const line = undoLine(item);
    send({
      message: `Removed ${name}`,
      action: {
        label: 'Undo',
        onPress: () => {
          void addListItems(householdId, [line], { notify: false }).then((undo) => {
            if (undo.error !== undefined) send({ message: undo.error, tone: 'error' });
          });
        },
      },
    });
  }

  const footer = gone ? undefined : (
    <>
      <PrimaryPillButton title="Delete" variant="danger" accessibilityLabel={`Delete ${name}`} disabled={pending} onPress={() => void remove()} />
      <View style={styles.fill}>
        <PrimaryPillButton title={pending ? 'Saving...' : 'Save changes'} loading={pending} disabled={!dirty} onPress={() => void save()} />
      </View>
    </>
  );

  return (
    <Sheet visible={visible} onClose={close} onDismiss={onDismiss} title={name} subtitle={listSubtitle(item)} footer={footer}>
      {gone ? (
        <View style={{ gap: spacing.md }}>
          <FormMessage tone="error" text="Someone in your household just removed this item." />
          <PrimaryPillButton title="Close" variant="outline" onPress={close} />
        </View>
      ) : (
        <>
          <Text style={[type.bodySmall, { color: colors.muted }]}>Added {timeAgo(item.created_at, now)}</Text>

          {message ? <FormMessage tone="error" text={message} /> : null}

          {checked ? (
            <View style={[styles.row, styles.between, { gap: spacing.md, minHeight: 44 }]}>
              <Text style={[type.body, styles.fill, { color: colors.ink }]}>
                {checkedByLabel((live ?? item).checked_by, members, session?.user.id ?? '')}
              </Text>
              <PrimaryPillButton title="Uncheck" variant="outline" disabled={pending} onPress={() => setItemChecked(item.id, false)} />
            </View>
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
                  placeholder="Any"
                  autoComplete="off"
                  error={shownErrors.quantity}
                />
              </View>
              <View style={styles.fill}>
                <UnitField label="Unit" value={form.unit} onChange={(unit) => set({ unit })} />
              </View>
            </View>
            <Text style={[type.bodySmall, { color: colors.muted }]}>Leave the amount empty for any amount.</Text>
          </View>

          <CategoryField
            label="Aisle"
            value={form.category}
            onChange={(category) => set({ category })}
            hint={form.category !== initial.category ? "We'll remember this for next time." : undefined}
          />

          <TextField
            label="Note"
            value={form.note}
            onChangeText={(text) => set({ note: text })}
            maxLength={200}
            placeholder="Brand, size, anything to remember"
            returnKeyType="done"
            error={shownErrors.note}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  amount: { width: 112 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  between: { alignItems: 'center' },
});
