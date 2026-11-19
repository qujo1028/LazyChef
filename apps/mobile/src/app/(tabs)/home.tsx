import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { HomeBoard } from '@/features/home/components/HomeBoard';
import { RecipeRow } from '@/features/home/components/RecipeRow';
import { Welcome } from '@/features/home/components/Welcome';
import { ThisWeekCard } from '@/features/habit/components/ThisWeekCard';
import { usePantry } from '@/features/pantry/pantry-provider';
import { queryKeys, useActiveHousehold } from '@/lib/household';
import { useOffline } from '@/lib/use-offline';
import { useSession } from '@/lib/use-session';
import { useTheme } from '@/theme';

/**
 * Home tab: greeting and expiring line, this week's card, the household board, and trending recipes.
 * Each part loads on its own and stays quiet (or shows its own state) when its read fails.
 */
export default function HomeScreen() {
  const { colors, spacing } = useTheme();
  const queryClient = useQueryClient();
  const offline = useOffline();
  const { session } = useSession();
  const { household, data: context } = useActiveHousehold();
  const { query: pantry } = usePantry();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    // Offline, a refetch waits for the network, so don't leave the spinner up.
    if (offline) return;
    setRefreshing(true);
    try {
      await Promise.all([
        pantry.refetch(),
        queryClient.refetchQueries({ queryKey: queryKeys.trending() }),
        queryClient.refetchQueries({ queryKey: queryKeys.libraryPool() }),
        household ? queryClient.refetchQueries({ queryKey: queryKeys.cooks(household.id) }) : null,
        household ? queryClient.refetchQueries({ queryKey: queryKeys.members(household.id) }) : null,
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [offline, pantry, queryClient, household]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 112 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      <Welcome displayName={context?.profile?.displayName ?? null} householdName={household?.name ?? null} />
      <View>
        <ThisWeekCard />
      </View>
      <HomeBoard householdId={household?.id ?? null} viewerId={session?.user.id ?? ''} />
      <RecipeRow />
    </ScrollView>
  );
}
