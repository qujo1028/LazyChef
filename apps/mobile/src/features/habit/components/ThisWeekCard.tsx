import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { dismissKey, pickNudges, type NudgeId } from '@lazychef/core/habit/nudges';
import { groupPantry } from '@lazychef/core/pantry/group';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useHabit } from '@/features/habit/use-habit';
import { useWeeklyGoal } from '@/features/habit/use-weekly-goal';
import { usePantry } from '@/features/pantry/pantry-provider';
import {
  applyDevPreset,
  DEV_PRESETS,
  nextTierHint,
  parseDismissed,
  serializeDismissed,
  streakLine,
  tierLine,
  weekHeadline,
  type DevPreset,
} from '@/lib/week-card';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme';

import { WeekDots, WeekRing } from './WeekRing';

const DISMISS_KEY = 'lazychef.week-nudges';

/** Home's "This week" card: the weekly ring (cook days vs goal), streak, tier, challenge and one nudge. */
export function ThisWeekCard() {
  const { colors, spacing, type, radius } = useTheme();
  const router = useRouter();
  const { householdId, items } = usePantry();
  const { summary: real, events, query } = useHabit(householdId);
  const today = useToday();
  const { goal } = useWeeklyGoal();

  // Dev only: preview states without waiting days. Display only, never saved.
  const [devOpen, setDevOpen] = useState(false);
  const [preset, setPreset] = useState<DevPreset | null>(null);
  const summary = useMemo(() => (real && preset ? applyDevPreset(real, preset) : real), [real, preset]);

  // Dismissed nudges, for one day. Loaded once; a failed read just shows every nudge.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const summaryToday = summary?.today ?? today;
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DISMISS_KEY)
      .then((raw) => {
        if (!active) return;
        // Keep this visit's dismissals, but only today's (yesterday's keys are stale).
        setDismissed((current) => {
          const next = parseDismissed(raw, summaryToday);
          for (const key of current) if (key.startsWith(`${summaryToday}:`)) next.add(key);
          return next;
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [summaryToday]);

  const dismiss = useCallback(
    (id: NudgeId) => {
      const key = dismissKey(summaryToday, id);
      const next = new Set(dismissed).add(key);
      setDismissed(next);
      AsyncStorage.setItem(DISMISS_KEY, serializeDismissed(summaryToday, next)).catch(() => {});
    },
    [summaryToday, dismissed],
  );

  const expiring = useMemo(() => {
    const list = groupPantry(items.values(), today).expiring;
    return { count: list.length, first: list[0]?.name ?? null };
  }, [items, today]);

  // Quiet while loading or when the read failed: Home shows nothing rather than an error here.
  if (!summary || !events) return null;

  const neverCooked = events.length === 0 && (query.data?.length ?? 0) === 0;
  const nudges = pickNudges(
    { expiring, almost: null, comeback: summary.comeback, firstCook: null },
    dismissed,
    summary.today,
    1,
  );
  const nudge = nudges[0];
  const { headline, sub } = weekHeadline(summary, goal, neverCooked);
  const tier = tierLine(summary.cooksThisWeek);
  const streak = streakLine(summary);
  const hint = summary.tier ? nextTierHint(summary.cooksThisWeek) : null;
  const challenge = summary.challenge;

  return (
    <View style={{ paddingBottom: spacing.lg }}>
      <Card>
        <View style={{ gap: spacing.md }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
            }}
          >
            <WeekRing cooks={summary.cooksThisWeek} goal={goal} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
                {headline}
              </Text>
              <Text style={[type.bodySmall, { color: colors.muted }]}>{sub}</Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: spacing.xs,
                  marginTop: spacing.xs,
                }}
              >
                {tier ? <Badge icon="medal" text={tier} /> : null}
                {streak ? <Badge icon="flame" text={streak} accent /> : null}
              </View>
              {hint && tier ? <Text style={[type.meta, { color: colors.muted }]}>{hint}</Text> : null}
            </View>
          </View>

          <WeekDots today={summary.today} days={summary.days} />

          <View
            accessible
            accessibilityLabel={challenge ? `${challenge.title}, ${challenge.label}` : 'Both challenges done this week'}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: colors.pill,
            }}
          >
            <Ionicons name="trophy" size={18} color={colors.primary} />
            {challenge ? (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={[type.recipeTitle, { color: colors.onPill }]}>{challenge.title}</Text>
                  <Text style={[type.meta, { color: colors.onPill }]}>{challenge.label}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {Array.from({ length: challenge.target }, (_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: i < challenge.progress ? colors.primary : colors.outline,
                      }}
                    />
                  ))}
                </View>
              </>
            ) : (
              <Text style={[type.bodySmall, { color: colors.onPill, flex: 1 }]}>Both challenges done this week.</Text>
            )}
          </View>

          {nudge ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingVertical: spacing.sm }}>
                <Text style={[type.bodySmall, { color: colors.ink }]}>{nudge.text}</Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={nudge.cta}
                  onPress={() => router.push(nudge.href as never)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={[type.button, { color: colors.primary }]}>{nudge.cta}</Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Dismiss: ${nudge.text}`}
                onPress={() => dismiss(nudge.id)}
                hitSlop={4}
                style={{
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}

          {__DEV__ ? (
            <View style={{ gap: spacing.sm }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setDevOpen((open) => !open)}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={[type.meta, { color: colors.muted }]}>
                  {devOpen ? 'Hide dev preview' : 'Dev preview'}
                  {preset ? ' (on)' : ''}
                </Text>
              </Pressable>
              {devOpen ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: spacing.sm,
                  }}
                >
                  {DEV_PRESETS.map(({ label, preset: p }) => (
                    <Chip key={label} label={label} onPress={() => setPreset(p)} />
                  ))}
                  <Chip label="Reset" onPress={() => setPreset(null)} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function Badge({ icon, text, accent = false }: { icon: 'medal' | 'flame'; text: string; accent?: boolean }) {
  const { colors, radius, type } = useTheme();
  const tint = accent ? colors.accent : colors.primary;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: colors.pill,
      }}
    >
      <Ionicons name={icon} size={14} color={tint} />
      <Text style={[type.meta, { color: colors.onPill }]}>{text}</Text>
    </View>
  );
}
