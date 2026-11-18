// The Ideas sheet: the single AI entry point (docs/product-scope.md, "One Ideas entry point").
// Pick a meal, add an optional hint, get up to three ideas made from the pantry. Consent comes
// first, the free count is shown, and every problem the `ai` Edge Function can report has a screen.
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AI_MAX_HINT_LENGTH,
  type AiAllowance,
  type AiFailure,
  type AiIdea,
  type AiIdeaMeal,
} from '@lazychef/core/ai/edge-contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useToast, type ToastOptions } from '@/components/Toast';
import { usePantry } from '@/features/pantry/pantry-provider';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { createAfterClose, type AfterClose } from '@/lib/after-close';
import { queryKeys } from '@/lib/household';
import {
  countLine,
  defaultIdeaMeal,
  IDEA_MEAL_CHOICES,
  limitReached,
  mealPhrase,
  MEAL_IDEAS_SENDS,
  problemFor,
  type IdeasProblem,
} from '@/lib/ideas-copy';
import { useTheme } from '@/theme';

import { callAi } from '../ai-edge';
import { addMissingToList, saveIdeaToMine, type IdeaActionResult } from '../api';
import * as DevFixtures from '../dev-fixtures';
import { useAiConsent } from '../use-ai-consent';
import { IdeaCard } from './IdeaCard';

type Phase =
  | { kind: 'idle' }
  | { kind: 'consent' }
  | { kind: 'loading' }
  | { kind: 'ready'; ideas: AiIdea[]; meal: AiIdeaMeal }
  | { kind: 'problem'; problem: IdeasProblem };

export function IdeasSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { show } = useToast();
  // Toasts render under the sheet, so they wait until it has closed (same as CookSheet).
  const [gate] = useState<AfterClose<ToastOptions>>(() => createAfterClose<ToastOptions>((t) => show(t)));

  useEffect(() => {
    if (visible) gate.opened();
    // Android's Modal has no onDismiss, so release held toasts when it hides.
    else if (Platform.OS !== 'ios') gate.closed();
  }, [visible, gate]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ideas"
      subtitle="Recipe ideas from what you have."
      onDismiss={() => {
        if (!visible) gate.closed();
      }}
    >
      <IdeasBody send={gate.send} />
    </Sheet>
  );
}

function IdeasBody({ send }: { send: (toast: ToastOptions) => void }) {
  const { colors, spacing, type } = useTheme();
  const queryClient = useQueryClient();
  const { householdId } = usePantry();
  const { consent, agree } = useAiConsent(MEAL_IDEAS_SENDS);

  const [meal, setMeal] = useState<AiIdeaMeal>(() => defaultIdeaMeal(new Date().getHours()));
  const [hint, setHint] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const asking = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The count line. Not asked for until the person has agreed, so nothing reaches the function before that.
  const allowanceKey = queryKeys.aiAllowance(householdId ?? 'none');
  const allowanceQuery = useQuery({
    queryKey: allowanceKey,
    enabled: householdId !== null && consent === true,
    staleTime: 30_000,
    queryFn: async (): Promise<AiAllowance | null> => {
      const result = await callAi({ action: 'allowance', householdId: householdId! });
      if (result.error !== undefined) return result.allowance ?? null;
      return result.allowance;
    },
  });
  const allowance = allowanceQuery.data ?? null;
  const line = countLine(allowance);

  const showProblem = useCallback((failure: AiFailure) => {
    setPhase({ kind: 'problem', problem: problemFor(failure, !onlineManager.isOnline()) });
  }, []);

  const request = useCallback(async () => {
    if (!householdId || asking.current) return;
    asking.current = true;
    setPhase({ kind: 'loading' });
    const trimmed = hint.trim();
    const result = await callAi({ action: 'ideas', householdId, meal, ...(trimmed ? { hint: trimmed } : {}) });
    asking.current = false;
    if (!alive.current) return;
    if (result.allowance) queryClient.setQueryData(allowanceKey, result.allowance);
    if (result.error !== undefined) return showProblem(result);
    setPhase({ kind: 'ready', ideas: result.ideas.slice(0, 3), meal });
  }, [householdId, hint, meal, queryClient, allowanceKey, showProblem]);

  function getIdeas() {
    if (consent !== true) {
      setPhase({ kind: 'consent' });
      return;
    }
    void request();
  }

  function agreeAndGo() {
    agree();
    void request();
  }

  async function save(idea: AiIdea, ideaMeal: AiIdeaMeal): Promise<IdeaActionResult> {
    if (!householdId) return { ok: false, message: "Your household isn't ready yet. Try again in a moment." };
    const result = await saveIdeaToMine(householdId, idea, ideaMeal);
    if (result.ok) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recipes(householdId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.saved(householdId) });
    }
    send({ message: result.ok ? `Saved ${idea.recipe.title} to Mine` : result.message, tone: result.ok ? undefined : 'error' });
    return result;
  }

  async function addMissing(idea: AiIdea): Promise<IdeaActionResult> {
    if (!householdId) return { ok: false, message: "Your household isn't ready yet. Try again in a moment." };
    const result = await addMissingToList(householdId, idea);
    if (result.ok) void queryClient.invalidateQueries({ queryKey: queryKeys.list(householdId) });
    send({ message: result.message, tone: result.ok ? undefined : 'error' });
    return result;
  }

  const busy = phase.kind === 'loading';
  const atLimit = limitReached(allowance);
  const limitProblem =
    atLimit && phase.kind === 'idle'
      ? problemFor({ error: '', code: 'limit_reached', allowance: allowance ?? undefined }, false)
      : null;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={[type.bodySmall, { color: colors.ink }]}>What are you making?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {IDEA_MEAL_CHOICES.map((choice) => (
            <Chip
              key={choice.value}
              label={choice.label}
              selected={meal === choice.value}
              onPress={() => setMeal(choice.value)}
              disabled={busy}
            />
          ))}
        </View>
      </View>

      <TextField
        label="Anything in mind? (optional)"
        value={hint}
        onChangeText={setHint}
        maxLength={AI_MAX_HINT_LENGTH}
        placeholder="Quick, vegetarian, one pan"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={getIdeas}
        editable={!busy}
      />

      <View style={{ gap: spacing.xs }}>
        <PrimaryPillButton
          title={busy ? 'Thinking' : `Get ideas for ${mealPhrase(meal)}`}
          onPress={getIdeas}
          loading={busy}
          disabled={consent === null || householdId === null || phase.kind === 'consent'}
        />
        {line ? (
          <Text accessibilityLiveRegion="polite" style={[type.meta, { color: colors.muted, textAlign: 'center' }]}>
            {line}
          </Text>
        ) : allowance?.pro ? (
          <Text style={[type.meta, { color: colors.muted, textAlign: 'center' }]}>Unlimited with Pro</Text>
        ) : null}
      </View>

      {phase.kind === 'consent' ? <ConsentPanel onAgree={agreeAndGo} onCancel={() => setPhase({ kind: 'idle' })} /> : null}
      {phase.kind === 'loading' ? <Skeleton /> : null}
      {phase.kind === 'problem' ? <ProblemCard problem={phase.problem} onRetry={() => void request()} /> : null}
      {limitProblem ? <ProblemCard problem={limitProblem} /> : null}
      {phase.kind === 'ready'
        ? phase.ideas.map((idea, index) => (
            <IdeaCard
              key={`${idea.recipe.title}-${index}`}
              idea={idea}
              onSave={(item) => save(item, phase.meal)}
              onAddMissing={addMissing}
            />
          ))
        : null}
      {phase.kind === 'ready' ? (
        <Text style={[type.meta, { color: colors.muted }]}>AI ideas can be wrong. Check them before you cook.</Text>
      ) : null}

      {__DEV__ ? (
        <DevControls
          setPhase={setPhase}
          setAllowance={(next) => queryClient.setQueryData(allowanceKey, next)}
          meal={meal}
          showProblem={showProblem}
        />
      ) : null}
    </View>
  );
}

function ConsentPanel({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  const { colors, spacing, type } = useTheme();
  return (
    <Card>
      <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
        Use AI for ideas?
      </Text>
      <Text style={[type.body, { color: colors.ink }]}>
        This sends {MEAL_IDEAS_SENDS} to an AI service to work out the ideas. It doesn&apos;t get your name, email or
        household. AI answers can be wrong, so check them before you rely on them.
      </Text>
      <View style={{ gap: spacing.sm }}>
        <PrimaryPillButton title="Use AI" onPress={onAgree} />
        <PrimaryPillButton title="Not now" variant="text" onPress={onCancel} />
      </View>
    </Card>
  );
}

function ProblemCard({ problem, onRetry }: { problem: IdeasProblem; onRetry?: () => void }) {
  const { colors, spacing, type } = useTheme();
  return (
    <Card>
      <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
        {problem.title}
      </Text>
      <FormMessage tone={problem.kind === 'limit' || problem.kind === 'empty_pantry' ? 'success' : 'error'} text={problem.message} />
      {problem.retry && onRetry ? (
        <View style={{ marginTop: spacing.xs }}>
          <PrimaryPillButton title="Try again" variant="outline" onPress={onRetry} />
        </View>
      ) : null}
      {problem.kind === 'empty_pantry' ? (
        <Text style={[type.bodySmall, { color: colors.muted }]}>Close this and tap the plus on the Pantry tab to add food.</Text>
      ) : null}
    </Card>
  );
}

function Skeleton() {
  const { colors, radius, spacing } = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.7;
      return;
    }
    pulse.value = withRepeat(withTiming(0.4, { duration: 800 }), -1, true);
  }, [reduceMotion, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const bar = (width: `${number}%`, height: number) => (
    <Animated.View style={[{ width, height, borderRadius: radius.sm, backgroundColor: colors.surfacePressed }, style]} />
  );
  return (
    <View accessible accessibilityLabel="Getting ideas" accessibilityLiveRegion="polite" style={{ gap: spacing.md }}>
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          {bar('60%', 20)}
          {bar('90%', 14)}
          {bar('75%', 14)}
        </Card>
      ))}
    </View>
  );
}

// Dev only: preview each state without the function (it isn't deployed yet).
function DevControls({
  setPhase,
  setAllowance,
  meal,
  showProblem,
}: {
  setPhase: (phase: Phase) => void;
  setAllowance: (allowance: AiAllowance) => void;
  meal: AiIdeaMeal;
  showProblem: (failure: AiFailure) => void;
}) {
  const { colors, spacing, type } = useTheme();
  const fx = DevFixtures;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[type.meta, { color: colors.muted }]}>Dev: preview a state</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip label="Loading" onPress={() => setPhase({ kind: 'loading' })} />
        <Chip label="3 ideas" onPress={() => { setAllowance(fx.DEV_ALLOWANCE); setPhase({ kind: 'ready', ideas: fx.DEV_IDEAS, meal }); }} />
        <Chip label="Consent" onPress={() => setPhase({ kind: 'consent' })} />
        <Chip label="Limit" onPress={() => { setAllowance(fx.DEV_LIMIT_FAILURE.allowance!); showProblem(fx.DEV_LIMIT_FAILURE); }} />
        <Chip label="Not set up" onPress={() => showProblem(fx.DEV_NOT_SET_UP)} />
        <Chip label="Rate limited" onPress={() => showProblem(fx.DEV_RATE_LIMITED)} />
        <Chip label="Empty pantry" onPress={() => showProblem(fx.DEV_EMPTY_PANTRY)} />
        <Chip label="Error" onPress={() => showProblem(fx.DEV_UPSTREAM)} />
        <Chip label="Clear" onPress={() => setPhase({ kind: 'idle' })} />
      </View>
    </View>
  );
}
