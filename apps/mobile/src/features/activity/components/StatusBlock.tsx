import { useState, type ReactNode } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { friendlyError } from '@/lib/household-settings';
import { useOffline } from '@/lib/use-offline';
import { useTheme } from '@/theme';

type QueryLike = { data: unknown; isError: boolean; isFetching: boolean; error: unknown; refetch: () => Promise<unknown> };

/**
 * Chart and Board body: loading, error with Try again, or (when there is data, even stale or offline)
 * the content in a pull-to-refresh scroller. Offline with cached data shows the data; the global
 * banner says the connection is gone.
 */
export function QueryScroll({ query, loadingLabel, children }: { query: QueryLike; loadingLabel: string; children: ReactNode }) {
  const { colors, spacing } = useTheme();
  const offline = useOffline();
  const [refreshing, setRefreshing] = useState(false);

  if (query.data === undefined) {
    if (query.isError || offline) {
      return (
        <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
          <FormMessage tone="error" text={offline ? "You're offline and nothing is saved yet." : friendlyError(query.error)} />
          <PrimaryPillButton title="Try again" onPress={() => void query.refetch()} loading={query.isFetching} />
        </View>
      );
    }
    return (
      <View style={{ paddingTop: spacing.xxl }}>
        <ActivityIndicator color={colors.primary} accessibilityLabel={loadingLabel} />
      </View>
    );
  }

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

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      {query.isError && !offline ? <FormMessage tone="error" text="Couldn't refresh. Pull down to try again." /> : null}
      {children}
    </ScrollView>
  );
}
