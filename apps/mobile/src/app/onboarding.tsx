import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { FormScreen } from '@/components/FormScreen';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { TextField } from '@/components/TextField';
import { InviteCard } from '@/features/invite/InviteCard';
import { unregisterThisDevice } from '@/features/push/device';
import { fetchInvitePreview, joinWithCode } from '@/features/invite/join';
import { usePendingInvite } from '@/features/invite/pending-invite-store';
import { StapleChips } from '@/features/onboarding/StapleChips';
import { buildFirstPantryEntries, typedItemNames } from '@/lib/first-pantry';
import { queryKeys, useHouseholdContext } from '@/lib/household';
import { cleanInviteCode, firstName, formatCodeInput, householdErrorMessage, MESSAGES } from '@/lib/invite-code';
import type { InvitePreview } from '@/lib/invite-preview';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type Step = 'choose' | 'name' | 'kitchen' | 'join';

export default function OnboardingScreen() {
  const { colors, type, spacing } = useTheme();
  const context = useHouseholdContext();
  const queryClient = useQueryClient();
  const pending = usePendingInvite();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [step, setStep] = useState<Step>('choose');

  // Look up a pending invite (a link opened while signed out) once it has been read.
  useEffect(() => {
    if (!pending.loaded || !pending.code) return;
    let active = true;
    fetchInvitePreview(pending.code).then((preview) => {
      if (!active) return;
      // A dead invite is forgotten. A rate limit or network error just skips the offer.
      if (preview.kind === 'invalid') pending.clear();
      else setInvite(preview);
    });
    return () => {
      active = false;
    };
  }, [pending.loaded, pending.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: queryKeys.all }), [queryClient]);

  // Offline on first launch: don't offer to create a household that may already exist.
  if (context.isError && !context.data) {
    return (
      <FormScreen>
        <Card>
          <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
            Couldn&apos;t load your household
          </Text>
          <Text style={[type.body, { color: colors.muted }]}>Check your connection and try again.</Text>
          <PrimaryPillButton title="Retry" onPress={() => context.refetch()} loading={context.isFetching} />
          <SignOut />
        </Card>
      </FormScreen>
    );
  }

  if (!pending.loaded || (pending.code && invite === null && !context.isError)) {
    // Brief wait for the stored invite and its lookup. A failed lookup sets `invite`, so this can't hang.
    return (
      <FormScreen>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
      </FormScreen>
    );
  }

  const name = firstName(context.data?.profile?.displayName);

  if (invite?.kind === 'found' && !invite.isMember) {
    return (
      <FormScreen>
        <Welcome name={name} />
        <View style={{ height: spacing.lg }} />
        <PendingInvite
          invite={invite}
          code={pending.code}
          clear={pending.clear}
          onDone={refresh}
          onDismiss={() => {
            void pending.clear();
            setInvite(null);
          }}
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Welcome name={name} />
      <View style={{ height: spacing.lg }} />
      {step === 'choose' ? (
        <Card>
          <PrimaryPillButton title="Start a household" onPress={() => setStep('name')} />
          <PrimaryPillButton title="Join with a code" variant="outline" onPress={() => setStep('join')} />
        </Card>
      ) : step === 'join' ? (
        <JoinWithCode onBack={() => setStep('choose')} onDone={refresh} />
      ) : (
        <StartHousehold step={step} setStep={setStep} onDone={refresh} />
      )}
      <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
        <SignOut />
      </View>
    </FormScreen>
  );
}

function Welcome({ name }: { name: string | null }) {
  const { colors, type, spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={[type.title, { color: colors.ink }]}>
        {name ? `Welcome, ${name}!` : 'Welcome!'}
      </Text>
      <Text style={[type.body, { color: colors.muted }]}>
        LazyChef keeps one pantry and shopping list for everyone you cook with. Start a household or join one.
      </Text>
    </View>
  );
}

function SignOut() {
  return <PrimaryPillButton title="Sign out" variant="text" onPress={() => void unregisterThisDevice().then(() => supabase.auth.signOut())} />;
}

function PendingInvite({
  invite,
  code,
  clear,
  onDone,
  onDismiss,
}: {
  invite: Extract<InvitePreview, { kind: 'found' }>;
  code: string | null;
  clear: () => Promise<void>;
  onDone: () => Promise<unknown>;
  onDismiss: () => void;
}) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function join() {
    if (!code) return;
    setJoining(true);
    setError(null);
    const result = await joinWithCode(code);
    if (!result.ok) {
      setError(result.message);
      setJoining(false);
      return;
    }
    await clear();
    await onDone();
    setJoining(false);
  }
  return (
    <InviteCard
      heading="You're invited to"
      householdName={invite.name}
      memberCount={invite.memberCount}
      error={error}
      joining={joining}
      onJoin={join}
      secondaryLabel="Not now"
      onSecondary={onDismiss}
    />
  );
}

function JoinWithCode({ onBack, onDone }: { onBack: () => void; onDone: () => Promise<unknown> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!cleanInviteCode(code)) {
      setError(MESSAGES.badCode);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await joinWithCode(code);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    await onDone();
    setBusy(false);
  }
  return (
    <Card>
      <TextField
        label="Invite code"
        hint="Ask someone in the household for it. It looks like K7QX-M2PA."
        value={code}
        onChangeText={(v) => setCode(formatCodeInput(v))}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        maxLength={9}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error ? <FormMessage tone="error" text={error} /> : null}
      <PrimaryPillButton title="Join" onPress={submit} loading={busy} />
      <PrimaryPillButton title="Back" variant="text" onPress={onBack} disabled={busy} />
    </Card>
  );
}

function StartHousehold({
  step,
  setStep,
  onDone,
}: {
  step: 'name' | 'kitchen';
  setStep: (s: Step) => void;
  onDone: () => Promise<unknown>;
}) {
  const { colors, type } = useTheme();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [staples, setStaples] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The household exists but the app hasn't opened it yet (a refresh failed). Never create a second one.
  const [created, setCreated] = useState(false);

  const count = typedItemNames(text).length + staples.filter((s) => !typedItemNames(text).includes(s)).length;

  function next() {
    const trimmed = name.trim();
    if (!trimmed) return setNameError('Give your household a name.');
    if (trimmed.length > 60) return setNameError('Keep it under 60 characters.');
    setNameError(null);
    setStep('kitchen');
  }

  async function finish(withItems: boolean) {
    setBusy(true);
    setError(null);
    // Local flag: the `created` state still reads false inside this call.
    let made = false;
    try {
      const { data: householdId, error: createError } = await supabase.rpc('create_household', { p_name: name.trim() });
      if (createError || !householdId) {
        setError(householdErrorMessage(createError ?? { message: null }));
        setBusy(false);
        return;
      }
      made = true;
      setCreated(true);
      const entries = withItems ? buildFirstPantryEntries(text, staples) : [];
      if (entries.length > 0) {
        // The household exists either way, so a failure here doesn't stop the flow.
        await supabase.rpc('add_pantry_items', { p_household_id: householdId, p_items: entries }).then(
          () => undefined,
          () => undefined,
        );
      }
    } catch (e) {
      if (!made) {
        setError(householdErrorMessage(e as Error));
        setBusy(false);
        return;
      }
    }
    await onDone();
    setBusy(false);
  }

  if (created) {
    return (
      <Card>
        <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
          Your household is ready
        </Text>
        <Text style={[type.body, { color: colors.muted }]}>We couldn&apos;t open it yet. Check your connection and try again.</Text>
        <PrimaryPillButton
          title="Open LazyChef"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await onDone();
            setBusy(false);
          }}
        />
      </Card>
    );
  }

  if (step === 'name') {
    return (
      <Card>
        <TextField
          label="Household name"
          hint="Something like The Johnsons or Apartment 4B."
          value={name}
          onChangeText={setName}
          error={nameError}
          maxLength={60}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={next}
        />
        <PrimaryPillButton title="Next" onPress={next} />
        <PrimaryPillButton title="Back" variant="text" onPress={() => setStep('choose')} />
      </Card>
    );
  }

  return (
    <Card>
      <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
        What&apos;s in your kitchen?
      </Text>
      <TextField
        label="Add a few things"
        hint="One per line or separated by commas, like 2 lbs chicken, eggs."
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        placeholder={'2 lbs chicken\neggs, milk'}
      />
      <Text style={[type.bodySmall, { color: colors.muted }]}>Or tap what you always have</Text>
      <StapleChips
        selected={staples}
        onToggle={(s) => setStaples((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}
      />
      {error ? <FormMessage tone="error" text={error} /> : null}
      <PrimaryPillButton
        title={count > 0 ? `Create household (${count} ${count === 1 ? 'item' : 'items'})` : 'Create household'}
        onPress={() => finish(true)}
        loading={busy}
      />
      <PrimaryPillButton title="Skip for now" variant="outline" onPress={() => finish(false)} disabled={busy} />
      <PrimaryPillButton title="Back" variant="text" onPress={() => setStep('name')} disabled={busy} />
    </Card>
  );
}
