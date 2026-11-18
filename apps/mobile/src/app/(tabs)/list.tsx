// W1 (feature/p3-list-screen) owns this file.
import { checkedByLabel } from '@lazychef/core/list/display';
import { groupList, listSummary } from '@lazychef/core/list/group';
import type { ListItem } from '@lazychef/core/list/types';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useHouseholdMembers } from '@/features/household/api';
import { ListEditSheet } from '@/features/list/components/ListEditSheet';
import { ListLineRow } from '@/features/list/components/ListLineRow';
import { ListQuickAdd } from '@/features/list/components/ListQuickAdd';
import { PutAwaySheet } from '@/features/list/components/PutAwaySheet';
import { useList } from '@/features/list/list-provider';
import { SectionHeading } from '@/features/pantry/components/PantrySectionRows';
import { friendlyError } from '@/lib/household-settings';
import { buildListRows, putAwayLabel, type ListRow } from '@/lib/list-rows';
import { useOffline } from '@/lib/use-offline';
import { useSession } from '@/lib/use-session';
import { useTheme } from '@/theme';

export default function ListScreen() {
  const { colors, spacing, type, radius } = useTheme();
  const { householdId, items, query, toggle } = useList();
  const { session } = useSession();
  const viewerId = session?.user.id ?? '';
  const membersData = useHouseholdMembers(householdId).data;
  const members = useMemo(() => membersData ?? [], [membersData]);
  const offline = useOffline();

  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; visible: boolean }>({ id: null, visible: false });
  const [putAway, setPutAway] = useState({ visible: false, session: 0 });

  const sections = useMemo(() => groupList(items.values()), [items]);
  const rows = useMemo(() => buildListRows(sections), [sections]);
  // Rows show who checked each line, so they must redraw when the members or the viewer load.
  const cartDetails = useMemo(() => ({ members, viewerId }), [members, viewerId]);
  const hasData =query.data !== undefined || items.size > 0;

  const openEdit = useCallback((item: ListItem) => setEditing({ id: item.id, visible: true }), []);
  const onToggle = useCallback(
    (item: ListItem) => {
      if (item.checked_at === null) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      toggle(item.id);
    },
    [toggle],
  );
  const openPutAway = useCallback(() => setPutAway((p) => ({ visible: true, session: p.session + 1 })), []);

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
    ({ item: row }: { item: ListRow }) => {
      switch (row.kind) {
        case 'heading':
          return <SectionHeading title={row.title} emoji={row.emoji} count={row.count} first={row.first} />;
        case 'item':
          return (
            <ListLineRow
              item={row.item}
              inCart={row.inCart}
              detail={row.inCart ? checkedByLabel(row.item.checked_by, members, viewerId) : undefined}
              first={row.first}
              last={row.last}
              onToggle={onToggle}
              onOpen={openEdit}
            />
          );
        case 'putAway':
          return (
            <View style={{ paddingTop: spacing.lg }}>
              <PrimaryPillButton title={putAwayLabel(row.count)} onPress={openPutAway} />
            </View>
          );
      }
    },
    [members, viewerId, onToggle, openEdit, openPutAway, spacing.lg],
  );

  const sheets = (
    <>
      <ListEditSheet itemId={editing.id} visible={editing.visible} onClose={() => setEditing((e) => ({ ...e, visible: false }))} />
      <PutAwaySheet visible={putAway.visible} session={putAway.session} onClose={() => setPutAway((p) => ({ ...p, visible: false }))} />
    </>
  );

  // First load, or failed with nothing to show.
  if (!hasData) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg }}>
        <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
          List
        </Text>
        {query.isError || offline ? (
          <View style={{ gap: spacing.md }}>
            <FormMessage
              tone="error"
              text={offline ? "You're offline and nothing is saved yet." : friendlyError(query.error)}
            />
            <PrimaryPillButton title="Try again" onPress={() => void query.refetch()} loading={query.isFetching} />
          </View>
        ) : (
          <View style={{ paddingTop: spacing.xxl }}>
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading the list" />
          </View>
        )}
        {sheets}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={rows}
        extraData={cartDetails}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={{ paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
                List
              </Text>
              <Text style={[type.body, { color: colors.muted }]}>
                {listSummary(sections.toBuyCount, sections.inCart.length)}
              </Text>
            </View>
            <ListQuickAdd householdId={householdId} />
            {query.isError && !offline ? (
              <FormMessage tone="error" text="Couldn't refresh the list. Pull down to try again." />
            ) : null}
            {offline ? <Text style={[type.bodySmall, { color: colors.muted }]}>{"You're offline. Showing what's saved."}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View
            style={{
              alignItems: 'center',
              gap: spacing.sm,
              padding: spacing.xl,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.outline,
            }}
          >
            <Text style={[type.heading, { color: colors.ink, textAlign: 'center' }]}>Your shopping list is empty.</Text>
            <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>
              Add items above, or from your pantry when something runs low.
            </Text>
          </View>
        }
      />
      {sheets}
    </View>
  );
}
