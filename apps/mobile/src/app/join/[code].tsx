import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { FormScreen } from '@/components/FormScreen';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { InviteCard } from '@/features/invite/InviteCard';
import { fetchInvitePreview, joinWithCode, makeActive } from '@/features/invite/join';
import { clearPendingInvite, savePendingInvite } from '@/features/invite/pending-invite-store';
import { queryKeys, useHouseholdContext } from '@/lib/household';
import { cleanInviteCode } from '@/lib/invite-code';
import type { InvitePreview } from '@/lib/invite-preview';
import { useSession } from '@/lib/use-session';
import { useTheme } from '@/theme';

/** app.lazychef://join/CODE. Signed out: remember the code and sign in first. Signed in: preview, then join. */
export default function JoinScreen() {
  const { code: param } = useLocalSearchParams<{ code: string }>();
  const { session, loading } = useSession();
  const code = cleanInviteCode(Array.isArray(param) ? param[0] : param);
  const userId = session?.user.id ?? null;
  const router = useRouter();

  // Signed out: keep the code for after sign in, then go to the welcome screen.
  useEffect(() => {
    if (loading || userId) return;
    let active = true;
    (async () => {
      if (code) await savePendingInvite(code);
      if (active) router.replace('/welcome');
    })();
    return () => {
      active = false;
    };
  }, [loading, userId, code, router]);

  if (loading || !userId) return <Waiting />;
  return <SignedInJoin code={code} userId={userId} />;
}

function Waiting() {
  const { colors } = useTheme();
  return (
    <FormScreen>
      <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
    </FormScreen>
  );
}

type View_ = { state: 'loading' } | { state: 'ready'; preview: InvitePreview };

function SignedInJoin({ code, userId }: { code: string | null; userId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, type, spacing } = useTheme();
  const [view, setView] = useState<View_>({ state: 'loading' });
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Onboarding is only reachable without a household; with one, a dead link leads back to the app.
  const hasHousehold = (useHouseholdContext().data?.memberships.length ?? 0) > 0;

  useEffect(() => {
    if (!code) return;
    let active = true;
    fetchInvitePreview(code).then((preview) => {
      if (active) setView({ state: 'ready', preview });
    });
    return () => {
      active = false;
    };
  }, [code, attempt]);

  const finish = useCallback(async () => {
    await clearPendingInvite();
    await queryClient.invalidateQueries({ queryKey: queryKeys.all });
    router.replace('/pantry');
  }, [queryClient, router]);

  const enterCode = useCallback(async () => {
    await clearPendingInvite();
    router.replace('/onboarding');
  }, [router]);

  const join = useCallback(async () => {
    if (!code) return;
    setJoining(true);
    setError(null);
    const result = await joinWithCode(code);
    if (result.ok) {
      await finish();
      return;
    }
    setError(result.message);
    setJoining(false);
  }, [code, finish]);

  const openMine = useCallback(
    async (householdId: string) => {
      setJoining(true);
      setError(null);
      if (await makeActive(userId, householdId)) {
        await finish();
        return;
      }
      setError("Couldn't switch households. Check your connection and try again.");
      setJoining(false);
    },
    [userId, finish],
  );

  const current: View_ = code ? view : { state: 'ready', preview: { kind: 'invalid' } };
  if (current.state === 'loading') return <Waiting />;
  const { preview } = current;

  if (preview.kind === 'found' && preview.isMember) {
    return (
      <FormScreen>
        <Card>
          <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
            You&apos;re already in {preview.name}
          </Text>
          <Text style={[type.body, { color: colors.muted }]}>Open it to see your pantry.</Text>
          {error ? <FormMessage tone="error" text={error} /> : null}
          <PrimaryPillButton title="Open pantry" onPress={() => openMine(preview.householdId)} loading={joining} />
        </Card>
      </FormScreen>
    );
  }

  if (preview.kind === 'found') {
    return (
      <FormScreen>
        <InviteCard
          heading="You're invited"
          householdName={preview.name}
          memberCount={preview.memberCount}
          error={error}
          joining={joining}
          onJoin={join}
          secondaryLabel="Not now"
          onSecondary={() => (clearPendingInvite(), router.replace('/'))}
        />
      </FormScreen>
    );
  }

  const failed = preview.kind === 'limited' || preview.kind === 'error';
  return (
    <FormScreen>
      <View style={{ gap: spacing.lg }}>
        <Card>
          <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
            {failed ? "Couldn't check this invite" : "This invite doesn't work"}
          </Text>
          {failed ? (
            <FormMessage tone="error" text={preview.message} />
          ) : (
            <Text style={[type.body, { color: colors.muted }]}>
              The link may be old or mistyped. Ask for a new one, or type the code yourself.
            </Text>
          )}
          {preview.kind === 'error' ? (
            <PrimaryPillButton title="Try again" onPress={() => {
                setView({ state: 'loading' });
                setAttempt((n) => n + 1);
              }} />
          ) : null}
          <PrimaryPillButton
            title={hasHousehold ? 'Back to the app' : 'Enter a code'}
            variant={preview.kind === 'error' ? 'outline' : 'primary'}
            onPress={hasHousehold ? () => router.replace('/') : enterCode}
          />
        </Card>
      </View>
    </FormScreen>
  );
}
