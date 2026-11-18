import { parseLines } from '@lazychef/core/ingredients/parse-line';
import { searchIngredients } from '@lazychef/core/ingredients/catalog';
import type { CatalogEntry } from '@lazychef/core/ingredients/types';
import { describeAdditions } from '@lazychef/core/pantry/merge';
import { draftsFromResolved, draftsToItems, type ReviewDraft } from '@lazychef/core/pantry/review';
import { replaceNameAtCaret, suggestionQuery } from '@lazychef/core/pantry/suggest';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { addButtonLabel, reviewTitle, stateOnOpen } from '@/lib/add-food';
import { useTheme } from '@/theme';
import { useToday } from '@/lib/use-today';

import { addItems, previewItems } from '../api';
import { usePantry } from '../pantry-provider';
import { AddSeveralInput } from './AddSeveralInput';
import { ReviewList } from './ReviewList';
import { SuggestionList } from './SuggestionList';

/** Text to start the sheet with; bump `n` to apply it (e.g. "Add 'oat milk'" from a search with no match). */
export type AddFoodSeed = { text: string; n: number };

const MAX_SUGGESTIONS = 6;
const EMPTY_MESSAGE = 'Type something to add, like "2 lbs chicken breast".';

/**
 * The one way to add food: a quick-add line with autocomplete, an "Add several" mode
 * (AddSeveralInput), then a review step (ReviewList), then addItems().
 * On success it closes and shows a toast (describeAdditions). Text and review survive an
 * accidental close; a successful add clears them.
 */
export function AddFoodSheet({ visible, onClose, seed }: { visible: boolean; onClose: () => void; seed: AddFoodSeed }) {
  const { colors, spacing, type } = useTheme();
  const toast = useToast();
  const today = useToday();
  const { householdId } = usePantry();

  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const batch = useRef(0);
  const pendingToast = useRef<string | null>(null);
  // Latest values for async results that land after the user closed the sheet or kept typing.
  const latest = useRef({ visible, text: seed.text });

  const [text, setText] = useState(seed.text);
  const [seenSeed, setSeenSeed] = useState(seed.n);
  const [cleared, setCleared] = useState(false);
  const [several, setSeveral] = useState(false);
  const [drafts, setDrafts] = useState<ReviewDraft[] | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState<number | null>(null);
  // Set after a pick so the caret lands after the new name; released on the next selection event.
  const [forcedCaret, setForcedCaret] = useState<number | null>(null);
  // The text the list was closed for (right after a pick); typing reopens it.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  // Opening with a new seed, or after a finished add, starts fresh. Otherwise keep what was typed.
  if (visible) {
    const { next, reset } = stateOnOpen({ text, seenSeed, cleared }, seed);
    if (reset) {
      setText(next.text);
      setSeenSeed(next.seenSeed);
      setCleared(next.cleared);
      setDrafts(null);
      setShowErrors(false);
      setError(null);
      setDismissedFor(null);
      setSeveral(false);
    }
  }

  useEffect(() => {
    latest.current = { visible, text };
  });

  // Focus the box when the sheet opens or we come back to typing (after the slide-in).
  useEffect(() => {
    if (!visible || drafts) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [visible, drafts, several]);

  const count = useMemo(() => (text.trim() ? parseLines(text).length : 0), [text]);

  const at = Math.min(caret ?? text.length, text.length);
  const query = focused && !several ? suggestionQuery(text, at) : null;
  const name = query?.name ?? '';
  const suggestions = useMemo(
    () => (name && dismissedFor !== text ? searchIngredients(name, MAX_SUGGESTIONS) : []),
    [name, dismissedFor, text],
  );

  function pick(entry: CatalogEntry) {
    if (!query) return;
    const next = replaceNameAtCaret(text, at, query.amountText, entry.name);
    setCaret(next.caret);
    setForcedCaret(next.caret);
    setDismissedFor(next.text);
    setText(next.text);
    inputRef.current?.focus();
  }

  function change(value: string) {
    setText(value);
    setForcedCaret(null);
    setDismissedFor(null);
    if (error) setError(null);
  }

  function backToTyping() {
    setDrafts(null);
    setShowErrors(false);
    setError(null);
  }

  async function preview() {
    if (pending) return;
    if (!text.trim()) {
      setError(EMPTY_MESSAGE);
      inputRef.current?.focus();
      return;
    }
    if (!householdId) {
      setError("We couldn't find your household. Try again in a moment.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await previewItems(householdId, text);
      // Closed or edited while it was working: drop the stale answer.
      if (!latest.current.visible || latest.current.text !== text) return;
      if (result.error !== undefined) {
        setError(result.error);
        return;
      }
      batch.current += 1;
      setShowErrors(false);
      const next = draftsFromResolved(result.items, batch.current);
      if (next.length === 0) setError(EMPTY_MESSAGE);
      else setDrafts(next);
    } finally {
      setPending(false);
    }
  }

  async function add() {
    if (!drafts || pending) return;
    const items = draftsToItems(drafts);
    if (!items) {
      setShowErrors(true);
      return;
    }
    if (!householdId) {
      setError("We couldn't find your household. Try again in a moment.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await addItems(householdId, items);
      if (result.error !== undefined) {
        // Toasts render under the modal, so errors stay inside the sheet.
        setError(result.error);
        return;
      }
      setCleared(true);
      pendingToast.current = describeAdditions(result);
      onClose();
      // Android's Modal has no onDismiss, so show the toast now; iOS waits for the slide-out.
      if (Platform.OS !== 'ios' || !latest.current.visible) flushToast();
    } finally {
      setPending(false);
    }
  }

  function flushToast() {
    const message = pendingToast.current;
    pendingToast.current = null;
    if (message) toast.show({ message });
  }

  const footer = drafts ? (
    <>
      <View>
        <PrimaryPillButton title="Back" variant="outline" onPress={backToTyping} disabled={pending} />
      </View>
      <View style={{ flex: 1 }}>
        <PrimaryPillButton title={addButtonLabel(drafts.length)} onPress={add} loading={pending} />
      </View>
    </>
  ) : (
    <View style={{ flex: 1 }}>
      <PrimaryPillButton title="Check it" onPress={preview} loading={pending} />
    </View>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismiss={flushToast}
      title={drafts ? reviewTitle(drafts.length) : 'Add food'}
      subtitle={
        drafts
          ? 'Fix a name, amount or category if it looks off.'
          : 'Type what you have, like "2 lbs chicken breast". Separate items with commas.'
      }
      footer={footer}
    >
      {drafts ? (
        <>
          <ReviewList
            drafts={drafts}
            onChange={(next) => {
              if (next.length === 0) backToTyping();
              else setDrafts(next);
            }}
            today={today}
            showErrors={showErrors}
            disabled={pending}
          />
          {error ? <FormMessage tone="error" text={error} /> : null}
        </>
      ) : (
        <>
          {several ? (
            <AddSeveralInput value={text} onChange={change} error={error} disabled={pending} autoFocus />
          ) : (
            <View style={{ gap: spacing.sm }}>
              <TextField
                ref={inputRef}
                label="What did you get?"
                placeholder="e.g. 2 lbs chicken breast"
                value={text}
                onChangeText={change}
                onSelectionChange={(event) => {
                  const { start } = event.nativeEvent.selection;
                  setCaret(start);
                  setForcedCaret(null);
                }}
                selection={forcedCaret === null ? undefined : { start: forcedCaret, end: forcedCaret }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSubmitEditing={preview}
                returnKeyType="go"
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                editable={!pending}
                maxLength={5000}
                error={error}
              />
              <SuggestionList suggestions={suggestions} query={name} onPick={pick} />
            </View>
          )}
          {several && error ? <FormMessage tone="error" text={error} /> : null}
          {count > 1 ? (
            <Text accessibilityLiveRegion="polite" style={[type.bodySmall, { color: colors.muted }]}>
              {count} items. You can check them all before they&apos;re added.
            </Text>
          ) : null}
          <View style={{ alignItems: 'flex-start' }}>
            <PrimaryPillButton
              title={several ? 'Add one at a time' : 'Add several'}
              variant="text"
              onPress={() => {
                setFocused(false);
                setSeveral((value) => !value);
              }}
              disabled={pending}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}
