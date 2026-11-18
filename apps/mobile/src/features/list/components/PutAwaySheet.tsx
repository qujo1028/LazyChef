import { normalizeIngredientName } from '@lazychef/core/ingredients/catalog';
import { draftsFromListItems, mergeHints } from '@lazychef/core/list/put-away';
import { describeAdditions } from '@lazychef/core/pantry/merge';
import { draftsToItems, type ReviewDraft } from '@lazychef/core/pantry/review';
import { convertQuantity } from '@lazychef/core/units';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { Sheet } from '@/components/Sheet';
import { useToast, type ToastOptions } from '@/components/Toast';
import { createAfterClose, type AfterClose } from '@/lib/after-close';
import { putAwayButtonLabel, putAwayTitle, putAwayToast, skippedCount } from '@/lib/put-away';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme';

import { ReviewList } from '@/features/pantry/components/ReviewList';
import { usePantry } from '@/features/pantry/pantry-provider';

import { putAway } from '../api';
import { useList } from '../list-provider';

/**
 * "Put away N items": the checked lines as the pantry's review cards (amounts filled in,
 * add expiry dates), with "Adds to your ..." hints, then putAway(). "Clear without adding"
 * clears them without touching the pantry. Bump `session` each time it opens so it starts
 * from the lines checked right then. Removing a card means "don't add it", but the line is
 * still cleared from the list (same as the web).
 */
export function PutAwaySheet({ visible, onClose, session }: { visible: boolean; onClose: () => void; session: number }) {
  const { colors, spacing, type } = useTheme();
  const { show } = useToast();
  const today = useToday();
  const list = useList();
  const pantry = usePantry();

  const [gate] = useState<AfterClose<ToastOptions>>(() => createAfterClose<ToastOptions>((t) => show(t)));

  const [seenSession, setSeenSession] = useState<number | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Each new session starts from the lines that are checked right now.
  // Wait for the list to load, or an early open would see no checked lines.
  if (visible && seenSession !== session && !list.query.isPending) {
    const checked = [...list.items.values()].filter((item) => item.checked_at !== null);
    setSeenSession(session);
    setIds(checked.map((item) => item.id));
    setDrafts(draftsFromListItems(checked));
    setShowErrors(false);
    setError(null);
  }

  useEffect(() => {
    if (visible) gate.opened();
    // Android's Modal has no onDismiss, so release the held toast when it hides.
    else if (Platform.OS !== 'ios') gate.closed();
  }, [visible, gate]);

  const dismissed = () => {
    if (!visible) gate.closed();
  };

  const hints = useMemo(() => {
    const existing = [...pantry.items.values()].map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      ingredient_id: item.ingredient_id,
    }));
    return mergeHints(drafts, existing, { normalize: normalizeIngredientName, convert: convertQuantity });
  }, [drafts, pantry.items]);

  const skipped = skippedCount(ids.length, drafts.length);

  async function finish(items: NonNullable<ReturnType<typeof draftsToItems>>) {
    if (pending) return;
    if (!list.householdId) {
      setError("We couldn't find your household. Try again in a moment.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await putAway(list.householdId, ids, items);
      if (result.error !== undefined) {
        // Toasts render under the sheet, so errors stay inside it.
        setError(result.error);
        return;
      }
      for (const id of ids) list.apply({ type: 'remove', id });
      void pantry.query.refetch();
      const additions = items.length > 0 ? describeAdditions(result) : '';
      gate.send({ message: putAwayToast(items.length, result.cleared, additions, skipped) });
      onClose();
    } finally {
      setPending(false);
    }
  }

  function confirm() {
    if (pending) return;
    const items = draftsToItems(drafts);
    if (!items) {
      setShowErrors(true);
      return;
    }
    void finish(items);
  }

  function clearWithout() {
    if (pending) return;
    Alert.alert(
      `Clear ${ids.length} from the list?`,
      "They won't be added to your pantry.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => void finish([]) },
      ],
    );
  }

  const empty = ids.length === 0;

  const footer = empty ? (
    <View style={{ flex: 1 }}>
      <PrimaryPillButton title="Close" onPress={onClose} />
    </View>
  ) : (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <PrimaryPillButton title={putAwayButtonLabel(drafts.length, ids.length)} onPress={confirm} loading={pending} />
      {drafts.length > 0 ? (
        <PrimaryPillButton title="Clear without adding" variant="outline" onPress={clearWithout} disabled={pending} />
      ) : null}
    </View>
  );

  return (
    <Sheet
      visible={visible}
      // Don't let a swipe close it while the request is running; the result would land on a hidden sheet.
      onClose={() => {
        if (!pending) onClose();
      }}
      onDismiss={dismissed}
      title={putAwayTitle(ids.length)}
      subtitle={empty ? undefined : 'Check the amounts and add expiry dates. These go to your pantry.'}
      footer={footer}
    >
      {empty ? (
        <Text style={[type.body, { color: colors.muted }]}>Check items off first.</Text>
      ) : (
        <>
          {error ? <FormMessage tone="error" text={error} /> : null}
          {drafts.length === 0 ? (
            <Text style={[type.body, { color: colors.muted }]}>
              Nothing left to add. The {ids.length === 1 ? 'item' : `${ids.length} items`} will just come off the list.
            </Text>
          ) : (
            <ReviewList
              drafts={drafts}
              onChange={setDrafts}
              today={today}
              showErrors={showErrors}
              disabled={pending}
              hints={hints}
            />
          )}
        </>
      )}
    </Sheet>
  );
}
