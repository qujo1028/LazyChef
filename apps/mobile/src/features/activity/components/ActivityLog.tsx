import { ACTIVITY_LIMIT, type ActivityMember } from '@lazychef/core/activity/feed';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useHouseholdMembers } from '@/features/household/api';
import { buildLogRows, type LogRow } from '@/lib/activity-screen';
import { friendlyError } from '@/lib/household-settings';
import { deviceTimeZone } from '@/lib/time-zone';
import { useNow } from '@/lib/use-now';
import { useOffline } from '@/lib/use-offline';
import { useTheme } from '@/theme';

import { useActivityFeed } from '../api';
import { ActivityEntryItem } from './ActivityEntryItem';

/** Activity: Log. The household's feed, grouped by day, newest first. */
export function ActivityLog({ householdId, viewerId }: { householdId: string | null; viewerId: string }) {
  const { colors, spacing, type, radius } = useTheme();
  const query = useActivityFeed(householdId);
  const membersData = useHouseholdMembers(householdId).data;
  const offline = useOffline();
  // Ticks each 30 s so "5m ago" keeps up.
  const now = useNow(30_000);
  const timeZone = deviceTimeZone();
  const [refreshing, setRefreshing] = useState(false);

  const members = useMemo(() => new Map<string, ActivityMember>((membersData ?? []).map((m) => [m.userId, m])), [membersData]);
  const rows = useMemo(() => buildLogRows(query.data ?? [], now, timeZone), [query.data, now, timeZone]);

  const refresh = async () => {
    // Offline, a refetch waits for the network, so don't leave the spinner up.
    if (offline) return;
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: LogRow }) =>
      item.kind === 'day' ? (
        <Text
          accessibilityRole="header"
          style={[type.meta, { color: colors.muted, paddingTop: spacing.lg, textTransform: 'uppercase', letterSpacing: 0.6 }]}
        >
          {item.label}
        </Text>
      ) : (
        <ActivityEntryItem entry={item.entry} viewerId={viewerId} members={members} now={now} timeZone={timeZone} />
      ),
    [colors.muted, spacing.lg, type.meta, viewerId, members, now, timeZone],
  );

  // First load, or failed with nothing to show.
  if (query.data === undefined) {
    if (query.isError || offline) {
      return (
        <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
          <FormMessage
            tone="error"
            text={offline ? "You're offline and nothing is saved yet." : friendlyError(query.error)}
          />
          <PrimaryPillButton title="Try again" onPress={() => void query.refetch()} loading={query.isFetching} />
        </View>
      );
    }
    return (
      <View style={{ paddingTop: spacing.xxl }}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading activity" />
      </View>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={renderItem}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: spacing.xxl, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        query.isError && !offline ? (
          <View style={{ paddingTop: spacing.md, gap: spacing.sm }}>
            <FormMessage tone="error" text="Couldn't refresh the activity. Pull down to try again." />
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        <View
          style={{
            marginTop: spacing.lg,
            alignItems: 'center',
            gap: spacing.sm,
            padding: spacing.xl,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.outline,
          }}
        >
          <Text style={[type.heading, { color: colors.ink, textAlign: 'center' }]}>No activity yet</Text>
          <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>
            When anyone in the household adds or uses something, it shows up here.
          </Text>
        </View>
      }
      ListFooterComponent={
        rows.length > 0 && (query.data?.length ?? 0) >= ACTIVITY_LIMIT ? (
          <Text style={[type.meta, { color: colors.muted, textAlign: 'center', paddingTop: spacing.lg }]}>
            Showing the latest {ACTIVITY_LIMIT} changes.
          </Text>
        ) : undefined
      }
    />
  );
}
