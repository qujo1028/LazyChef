import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { AccountRow } from '@/features/account/components/AccountRow';
import { HouseholdNameCard } from '@/features/household/components/HouseholdNameCard';
import { InviteCard } from '@/features/household/components/InviteCard';
import { LeaveCard } from '@/features/household/components/LeaveCard';
import { MembersCard } from '@/features/household/components/MembersCard';
import { SwitchHouseholdCard } from '@/features/household/components/SwitchHouseholdCard';
import { useHouseholdMembers } from '@/features/household/api';
import { friendlyError } from '@/lib/household-settings';
import { queryKeys, useActiveHousehold } from '@/lib/household';
import { useOffline } from '@/lib/use-offline';
import { useTheme } from '@/theme';

export default function HouseholdScreen() {
  const { colors, spacing, type } = useTheme();
  const queryClient = useQueryClient();
  const offline = useOffline();
  const active = useActiveHousehold();
  const { household, role } = active;
  const members = useHouseholdMembers(household?.id ?? null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
    } finally {
      setRefreshing(false);
    }
  };

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />;
  const frame = { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg };

  // Nothing cached yet.
  if (!household) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.grow, frame]}
        refreshControl={refreshControl}
      >
        {active.isError ? (
          <View style={{ gap: spacing.md }}>
            <FormMessage
              tone="error"
              text={offline ? "You're offline and nothing is saved yet." : friendlyError(active.error)}
            />
            <PrimaryPillButton title="Try again" onPress={() => void active.refetch()} loading={active.isFetching} />
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading household" />
          </View>
        )}
      </ScrollView>
    );
  }

  const isOwner = role === 'owner';
  const memberCount = members.data ? members.data.length : null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.grow, frame]}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      <AccountRow />

      <HouseholdNameCard householdId={household.id} name={household.name} memberCount={memberCount} canRename={isOwner} />

      <InviteCard
        householdId={household.id}
        householdName={household.name}
        inviteCode={household.inviteCode}
        isOwner={isOwner}
      />

      {members.data ? (
        <MembersCard householdId={household.id} members={members.data} viewerId={active.data!.userId} isOwner={isOwner} />
      ) : members.isError ? (
        <View style={{ gap: spacing.md }}>
          <Text accessibilityRole="header" style={[type.heading, { color: colors.ink }]}>
            Members
          </Text>
          <FormMessage tone="error" text={friendlyError(members.error)} />
          <PrimaryPillButton title="Try again" variant="outline" onPress={() => void members.refetch()} loading={members.isFetching} />
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading members" />
        </View>
      )}

      {active.data && active.data.memberships.length > 1 ? (
        <SwitchHouseholdCard
          userId={active.data.userId}
          memberships={active.data.memberships}
          activeId={household.id}
        />
      ) : null}

      <LeaveCard householdId={household.id} householdName={household.name} memberCount={memberCount} isOwner={isOwner} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
  center: { alignItems: 'center', paddingVertical: 24 },
});
