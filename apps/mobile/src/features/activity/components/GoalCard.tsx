import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { WeekDots, WeekRing } from '@/features/habit/components/WeekRing';
import { useHabit } from '@/features/habit/use-habit';
import { useWeeklyGoal } from '@/features/habit/use-weekly-goal';
import { applyDevPreset, nextTierHint, streakLine, tierLine, weekHeadline, type DevPreset } from '@/lib/week-card';
import { useTheme } from '@/theme';

/**
 * The viewer's week at the top of Board: ring against their stored goal, tier, streak and the current
 * rotating challenge. Same numbers as Pantry's card. Goal editing lives on Account.
 */
export function GoalCard({ householdId, preset }: { householdId: string | null; preset: DevPreset | null }) {
  const { colors, spacing, type, radius } = useTheme();
  const router = useRouter();
  const { summary: real, events, query } = useHabit(householdId);
  const { goal } = useWeeklyGoal();
  const summary = useMemo(() => (real && preset ? applyDevPreset(real, preset) : real), [real, preset]);

  // Quiet while loading or when the read failed: the board below carries the error.
  if (!summary || !events) return null;

  const neverCooked = events.length === 0 && (query.data?.length ?? 0) === 0;
  const { headline, sub } = weekHeadline(summary, goal, neverCooked);
  const tier = tierLine(summary.cooksThisWeek);
  const streak = streakLine(summary);
  const hint = summary.tier ? nextTierHint(summary.cooksThisWeek) : null;
  const challenge = summary.challenge;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <WeekRing cooks={summary.cooksThisWeek} goal={goal} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
            {headline}
          </Text>
          <Text style={[type.bodySmall, { color: colors.muted }]}>{sub}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
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

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Change goal, now ${goal} ${goal === 1 ? 'night' : 'nights'} a week`}
        onPress={() => router.push('/account')}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={[type.button, { color: colors.primary }]}>Change goal</Text>
      </Pressable>
    </Card>
  );
}

function Badge({ icon, text, accent = false }: { icon: 'medal' | 'flame'; text: string; accent?: boolean }) {
  const { colors, radius, type } = useTheme();
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
      <Ionicons name={icon} size={14} color={accent ? colors.accent : colors.primary} />
      <Text style={[type.meta, { color: colors.onPill }]}>{text}</Text>
    </View>
  );
}
