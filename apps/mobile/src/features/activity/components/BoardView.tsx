import Ionicons from '@expo/vector-icons/Ionicons';
import { computeLeaderboard, type BoardEntry, type BoardMember } from '@lazychef/core/habit/leaderboard';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useHouseholdMembers } from '@/features/household/api';
import { useHouseholdCooks } from '@/features/habit/use-habit';
import {
  BOARD_MODES,
  barPercent,
  boardDays,
  boardPeriodNote,
  boardRowLabel,
  type BoardMode,
  type DevBoardData,
} from '@/lib/activity-screen';
import type { DevPreset } from '@/lib/week-card';
import { deviceTimeZone } from '@/lib/time-zone';
import { useNow } from '@/lib/use-now';
import { COOK_ROW_LIMIT } from '@lazychef/core/habit/constants';
import { useTheme } from '@/theme';

import { Avatar } from './Avatar';
import { GoalCard } from './GoalCard';
import { SegmentedControl } from './SegmentedControl';
import { QueryScroll } from './StatusBlock';

type Props = {
  householdId: string | null;
  viewerId: string;
  dev: DevBoardData | null;
  devGoalPreset: DevPreset | null;
};

/** Activity: Board. The viewer's week on top, then who cooked the most days (weekly or all time). */
export function BoardView({ householdId, viewerId, dev, devGoalPreset }: Props) {
  const { colors, spacing, type, radius } = useTheme();
  const router = useRouter();
  const cooks = useHouseholdCooks(householdId);
  const membersQuery = useHouseholdMembers(householdId);
  const now = useNow();
  const timeZone = deviceTimeZone();
  const [mode, setMode] = useState<BoardMode>('week');

  const members = useMemo<BoardMember[]>(
    () =>
      dev
        ? dev.members
        : (membersQuery.data ?? []).map((m) => ({ userId: m.userId, displayName: m.displayName, avatarUrl: m.avatarUrl })),
    [dev, membersQuery.data],
  );
  const rows = useMemo(
    () => (dev ? dev.rows : (cooks.data ?? []).map((r) => ({ action: 'cooked', actorId: r.actorId, createdAt: r.createdAt }))),
    [dev, cooks.data],
  );
  const board = useMemo(() => computeLeaderboard(rows, members, now, timeZone), [rows, members, now, timeZone]);

  // The cook read is capped, so all-time counts can be "at least" once it is full.
  const truncated = !dev && (cooks.data?.length ?? 0) >= COOK_ROW_LIMIT;
  const entries = mode === 'week' ? board.weekly : board.allTime;
  const max = Math.max(0, ...entries.map((e) => (mode === 'week' ? e.week : e.allTime)));
  const winners = board.lastWeekWinners.map((e) => (e.userId === viewerId ? 'You' : e.name));
  const nobodyYet = mode === 'week' && max === 0;
  const waitingForMembers = !dev && membersQuery.data === undefined;

  const query = dev ? { ...cooks, data: rows } : waitingForMembers ? { ...cooks, data: undefined } : cooks;

  return (
    <QueryScroll query={query} loadingLabel="Loading the board">
      <GoalCard householdId={householdId} preset={devGoalPreset} />

      {members.length < 2 ? (
        <Card>
          <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
            Cooking is better together
          </Text>
          <Text style={[type.body, { color: colors.muted }]}>
            Invite a housemate and see who cooked the most days each week.
          </Text>
          <PrimaryPillButton title="Invite someone" variant="outline" onPress={() => router.navigate('/household')} />
        </Card>
      ) : (
        <View style={{ gap: spacing.md }}>
          <SegmentedControl label="Board period" options={BOARD_MODES} value={mode} onChange={setMode} />
          <Text style={[type.bodySmall, { color: colors.muted }]}>{boardPeriodNote(mode)}</Text>

          {winners.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="trophy" size={16} color={colors.accent} />
              <Text style={[type.bodySmall, { color: colors.muted, flex: 1 }]}>{`Last week's winner: ${winners.join(' and ')}`}</Text>
            </View>
          ) : null}

          {nobodyYet ? (
            <View
              style={{ padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.outline }}
            >
              <Text style={[type.body, { color: colors.muted }]}>
                Nobody has cooked yet this week. A fresh start for everyone.
              </Text>
            </View>
          ) : null}

          <View accessibilityLabel={mode === 'week' ? 'This week' : 'All time'} style={{ gap: spacing.sm }}>
            {entries.map((entry) => (
              <BoardRow
                key={entry.userId}
                entry={entry}
                mode={mode}
                max={max}
                isViewer={entry.userId === viewerId}
                truncated={truncated}
              />
            ))}
          </View>

          <Text style={[type.meta, { color: colors.muted }]}>
            One cook day counts once, however many meals you make that day.
            {truncated && mode === 'allTime' ? ' All time covers your most recent history, so these are at least counts.' : ''}
          </Text>
        </View>
      )}
    </QueryScroll>
  );
}

function BoardRow({
  entry,
  mode,
  max,
  isViewer,
  truncated,
}: {
  entry: BoardEntry;
  mode: BoardMode;
  max: number;
  isViewer: boolean;
  truncated: boolean;
}) {
  const { colors, spacing, type, radius } = useTheme();
  const count = mode === 'week' ? entry.week : entry.allTime;
  const rank = mode === 'week' ? entry.weekRank : entry.allTimeRank;
  const atLeast = truncated && mode === 'allTime';
  return (
    <View
      accessible
      accessibilityLabel={boardRowLabel(rank, entry.name, isViewer, count, entry.wonLastWeek, atLeast)}
      style={{
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderRadius: radius.md,
        borderWidth: isViewer ? 2 : 1,
        borderColor: isViewer ? colors.primary : colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Text style={[type.button, { width: 22, textAlign: 'center', color: colors.muted }]}>{rank}</Text>
        <Avatar name={entry.name} uri={entry.avatarUrl} size={40} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text numberOfLines={1} style={[type.body, { color: colors.ink, flexShrink: 1, fontFamily: 'SourceSans3_600SemiBold' }]}>
            {isViewer ? `${entry.name} (you)` : entry.name}
          </Text>
          {entry.wonLastWeek ? <Ionicons name="trophy" size={14} color={colors.accent} /> : null}
        </View>
        <Text style={[type.bodySmall, { color: colors.ink, fontFamily: 'SourceSans3_600SemiBold' }]}>
          {boardDays(count, atLeast)}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.pill }}
      >
        <View
          style={{
            height: 6,
            borderRadius: 3,
            width: `${barPercent(count, max)}%`,
            backgroundColor: isViewer ? colors.primary : colors.outline,
          }}
        />
      </View>
    </View>
  );
}
