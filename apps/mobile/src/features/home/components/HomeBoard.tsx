import Ionicons from '@expo/vector-icons/Ionicons';
import { computeLeaderboard, type BoardMember } from '@lazychef/core/habit/leaderboard';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/Card';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useHabit, useHouseholdCooks } from '@/features/habit/use-habit';
import { useHouseholdMembers } from '@/features/household/api';
import { boardDays, boardRowLabel } from '@/lib/activity-screen';
import { deviceTimeZone } from '@/lib/time-zone';
import { useNow } from '@/lib/use-now';
import { useTheme } from '@/theme';

const SHOWN = 3;

/**
 * Home: the household board in small. The top cooks this week, the current challenge, and "See all"
 * (Activity). On your own it nudges you to invite someone. Quiet until both reads have landed.
 */
export function HomeBoard({ householdId, viewerId }: { householdId: string | null; viewerId: string }) {
  const { colors, spacing, type, radius } = useTheme();
  const router = useRouter();
  const cooks = useHouseholdCooks(householdId);
  const membersQuery = useHouseholdMembers(householdId);
  const { summary } = useHabit(householdId);
  const now = useNow();
  const timeZone = deviceTimeZone();

  const members = useMemo<BoardMember[]>(
    () => (membersQuery.data ?? []).map((m) => ({ userId: m.userId, displayName: m.displayName, avatarUrl: m.avatarUrl })),
    [membersQuery.data],
  );
  const rows = useMemo(
    () => (cooks.data ?? []).map((r) => ({ action: 'cooked', actorId: r.actorId, createdAt: r.createdAt })),
    [cooks.data],
  );
  const board = useMemo(() => computeLeaderboard(rows, members, now, timeZone), [rows, members, now, timeZone]);

  if (cooks.data === undefined || membersQuery.data === undefined) return null;

  const seeAll = () => router.push('/activity');
  const top = board.weekly.slice(0, SHOWN);
  const nobodyYet = top.every((entry) => entry.week === 0);
  const challenge = summary?.challenge ?? null;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
          Household board
        </Text>
        {members.length >= 2 ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="See all on the board"
            onPress={seeAll}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={[type.button, { color: colors.primary }]}>See all</Text>
          </Pressable>
        ) : null}
      </View>

      {members.length < 2 ? (
        <>
          <Text style={[type.body, { color: colors.muted }]}>
            Cooking is better together. Invite a housemate and see who cooked the most days each week.
          </Text>
          <PrimaryPillButton title="Invite someone" variant="outline" onPress={() => router.navigate('/household')} />
        </>
      ) : nobodyYet ? (
        <Text style={[type.body, { color: colors.muted }]}>Nobody has cooked yet this week. A fresh start for everyone.</Text>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {top.map((entry) => {
            const isViewer = entry.userId === viewerId;
            return (
              <View
                key={entry.userId}
                accessible
                accessibilityLabel={boardRowLabel(entry.weekRank, entry.name, isViewer, entry.week, entry.wonLastWeek, false)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
              >
                <Text style={[type.button, { width: 22, textAlign: 'center', color: colors.muted }]}>{entry.weekRank}</Text>
                <Avatar name={entry.name} url={entry.avatarUrl} size={36} />
                <Text
                  numberOfLines={1}
                  style={[type.body, { flex: 1, color: colors.ink, fontFamily: 'SourceSans3_600SemiBold' }]}
                >
                  {isViewer ? `${entry.name} (you)` : entry.name}
                </Text>
                <Text style={[type.bodySmall, { color: colors.ink, fontFamily: 'SourceSans3_600SemiBold' }]}>
                  {boardDays(entry.week, false)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {summary ? (
        <View
          accessible
          accessibilityLabel={challenge ? `Challenge: ${challenge.title}, ${challenge.label}` : 'Both challenges done this week'}
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
            <View style={{ flex: 1 }}>
              <Text style={[type.recipeTitle, { color: colors.onPill }]}>{challenge.title}</Text>
              <Text style={[type.meta, { color: colors.onPill }]}>{challenge.label}</Text>
            </View>
          ) : (
            <Text style={[type.bodySmall, { color: colors.onPill, flex: 1 }]}>Both challenges done this week.</Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}
