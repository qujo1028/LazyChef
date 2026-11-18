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
import { useToast, type ToastOptions } from '@/components/Toast';
import { createAfterClose, type AfterClose } from '@/lib/after-close';
import { addButtonLabel, reviewTitle, stateOnOpen } from '@/lib/add-food';
import { addScansToText, emptyScanLinks, linkDrafts, memoriesForAdd, type ScanLinks } from '@/lib/scan-links';
import { isLooking, reviewLabel, scannedLines } from '@/lib/scan-rows';
import { useTheme } from '@/theme';
import { useToday } from '@/lib/use-today';

import { rememberBarcodes } from '../../barcodes/lookup';
import { useScanRows } from '../../barcodes/use-scan-rows';
import { addItems, previewItems } from '../api';
import { usePantry } from '../pantry-provider';
import { AddSeveralInput } from './AddSeveralInput';
import { ReviewList } from './ReviewList';
import { ScanPanel } from './ScanPanel';
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
  const { show } = useToast(); // stable, so the gate can keep it
  const today = useToday();
  const { householdId } = usePantry();

  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const batch = useRef(0);
  // Latest values for async results that land after the user closed the sheet or kept typing.
  const latest = useRef({ visible, text: seed.text });

  // The toast renders under the sheet, so it waits until the sheet has closed.
  const [gate] = useState<AfterClose<ToastOptions>>(() => createAfterClose<ToastOptions>((t) => show(t)));

  const [text, setText] = useState(seed.text);
  const [seenSeed, setSeenSeed] = useState(seed.n);
  const [cleared, setCleared] = useState(false);
  const [several, setSeveral] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scan = useScanRows(householdId);
  // Scanned lines in the box -> their barcode, so a renamed item is remembered under its new name.
  const [links] = useState<ScanLinks>(emptyScanLinks);
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
      setScanning(false);
      scan.clear();
      links.byRaw.clear();
      links.packages.clear();
    }
  }

  useEffect(() => {
    latest.current = { visible, text };
  });

  useEffect(() => {
    if (visible) gate.opened();
    // Android's Modal has no onDismiss, so release the held toast when it hides.
    else if (Platform.OS !== 'ios') gate.closed();
  }, [visible, gate]);

  // A late dismiss from an earlier open must not release the toast while the sheet is open.
  const dismissed = () => {
    if (!visible) gate.closed();
  };

  // Focus the box when the sheet opens or we come back to typing (after the slide-in).
  useEffect(() => {
    if (!visible || drafts || scanning) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [visible, drafts, several, scanning]);

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

  async function preview(override?: string): Promise<boolean> {
    if (pending) return false;
    const sent = typeof override === 'string' ? override : text;
    if (!sent.trim()) {
      setError(EMPTY_MESSAGE);
      inputRef.current?.focus();
      return false;
    }
    if (!householdId) {
      setError("We couldn't find your household. Try again in a moment.");
      return false;
    }
    setError(null);
    setPending(true);
    try {
      const result = await previewItems(householdId, sent);
      // Closed or edited while it was working: drop the stale answer.
      if (!latest.current.visible || latest.current.text !== sent) return false;
      if (result.error !== undefined) {
        setError(result.error);
        return false;
      }
      batch.current += 1;
      setShowErrors(false);
      const next = linkDrafts(
        draftsFromResolved(result.items, batch.current),
        result.items.map((item) => item.raw),
        links,
      );
      if (next.length === 0) {
        setError(EMPTY_MESSAGE);
        return false;
      }
      setDrafts(next);
      return true;
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
    const memories = memoriesForAdd(drafts, links);
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
      if (memories.length > 0) void rememberBarcodes(householdId, memories);
      links.byRaw.clear();
      links.packages.clear();
      scan.clear();
      gate.send({ message: describeAdditions(result) });
      onClose();
    } finally {
      setPending(false);
    }
  }

  function doneScanning() {
    const lines = scannedLines(scan.rows);
    if (lines.length === 0 || isLooking(scan.rows)) return;
    const next = addScansToText(text, lines, links);
    setText(next);
    setScanning(false);
    // The lines are in the box now, so the scan list is done with. Keeping it would add them a
    // second time if the check fails and the person scans again.
    scan.clear();
    void preview(next);
  }

  const found = scannedLines(scan.rows).length;

  const footer = drafts ? (
    <>
      <View>
        <PrimaryPillButton title="Back" variant="outline" onPress={backToTyping} disabled={pending} />
      </View>
      <View style={{ flex: 1 }}>
        <PrimaryPillButton title={addButtonLabel(drafts.length)} onPress={add} loading={pending} />
      </View>
    </>
  ) : scanning ? (
    <>
      <View>
        <PrimaryPillButton title="Back" variant="outline" onPress={() => setScanning(false)} disabled={pending} />
      </View>
      <View style={{ flex: 1 }}>
        <PrimaryPillButton
          title={reviewLabel(found)}
          onPress={doneScanning}
          disabled={found === 0 || isLooking(scan.rows)}
          loading={pending}
        />
      </View>
    </>
  ) : (
    <View style={{ flex: 1 }}>
      <PrimaryPillButton title="Check it" onPress={() => void preview()} loading={pending} />
    </View>
  );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismiss={dismissed}
      title={drafts ? reviewTitle(drafts.length) : scanning ? 'Scan your groceries' : 'Add food'}
      subtitle={
        drafts
          ? 'Fix a name, amount or category if it looks off.'
          : scanning
            ? "Point at each barcode. You'll check everything before it's added."
            : 'Type what you have, like "2 lbs chicken breast". Separate items with commas.'
      }
      footer={footer}
    >
      {drafts ? (
        <>
          {error ? <FormMessage tone="error" text={error} /> : null}
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
        </>
      ) : scanning ? (
        <ScanPanel
          rows={scan.rows}
          active={visible && !pending}
          onCode={scan.scan}
          onRetry={scan.retry}
          onName={scan.name}
          onRemove={scan.remove}
        />
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
                onSubmitEditing={() => void preview()}
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
            <PrimaryPillButton
              title="Scan barcodes"
              variant="text"
              onPress={() => {
                setFocused(false);
                setScanning(true);
              }}
              disabled={pending}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}
