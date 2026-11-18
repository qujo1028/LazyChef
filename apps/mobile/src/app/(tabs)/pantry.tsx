import { pantrySummary, remainingMessage } from '@lazychef/core/pantry/display';
import { groupPantry } from '@lazychef/core/pantry/group';
import type { PantryItem } from '@lazychef/core/pantry/types';
import * as Haptics from 'expo-haptics';
import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { useToast } from '@/components/Toast';
import { useAddPantryItemToList } from '@/features/list/add-to-list';
import { AddFoodSheet, type AddFoodSeed } from '@/features/pantry/components/AddFoodSheet';
import { EditItemSheet } from '@/features/pantry/components/EditItemSheet';
import { ThisWeekCard } from '@/features/habit/components/ThisWeekCard';
import { GettingStarted } from '@/features/pantry/components/GettingStarted';
import { PantryItemRow } from '@/features/pantry/components/PantryItemRow';
import { PantrySearch } from '@/features/pantry/components/PantrySearch';
import { RanOutToggle, SectionHeading, StapleChips } from '@/features/pantry/components/PantrySectionRows';
import { usePantry } from '@/features/pantry/pantry-provider';
import { friendlyError } from '@/lib/household-settings';
import { amountTaken, buildPantryRows, type PantryRow } from '@/lib/pantry-rows';
import { useOffline } from '@/lib/use-offline';
import { useToday } from '@/lib/use-today';
import { useTheme } from '@/theme';

export default function PantryScreen() {
  const { colors, spacing, type, radius } = useTheme();
  const { householdId, items, query, adjust } = usePantry();
  const today = useToday();
  const toast = useToast();
  const offline = useOffline();

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const trimmed = deferredSearch.trim();
  const [ranOutOpen, setRanOutOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState<{ visible: boolean; seed: AddFoodSeed }>({ visible: false, seed: { text: '', n: 0 } });
  const [editing, setEditing] = useState<{ id: string | null; visible: boolean }>({ id: null, visible: false });

  const all = useMemo(() => groupPantry(items.values(), today), [items, today]);
  // An empty pantry hides the search field, so a leftover search must not count.
  const searching = trimmed !== '' && all.total > 0;
  const shown = useMemo(
    () => (searching ? groupPantry(items.values(), today, deferredSearch) : all),
    [all, items, today, deferredSearch, searching],
  );
  const rows = useMemo(() => buildPantryRows(shown, { ranOutOpen, searching }), [shown, ranOutOpen, searching]);
  const existingNames = useMemo(
    () => new Set([...items.values()].map((item) => item.name.trim().toLowerCase())),
    [items],
  );

  const empty = all.total === 0;
  const onlyStaples = !empty && all.staples.length === all.total;
  const hasData = query.data !== undefined || items.size > 0;

  const openAdd = useCallback((text?: string) => {
    setAdding((current) => ({
      visible: true,
      seed: text === undefined ? current.seed : { text, n: current.seed.n + 1 },
    }));
  }, []);

  const openEdit = useCallback((item: PantryItem) => setEditing({ id: item.id, visible: true }), []);

  const takeOne = useCallback(
    (item: PantryItem) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const taken = amountTaken(item.quantity);
      adjust(item.id, -1, {
        onDone: (quantity) =>
          toast.show({
            id: `used-${item.id}`,
            message: remainingMessage(item.name, quantity, item.unit),
            action: { label: 'Undo', onPress: () => adjust(item.id, taken, { onError: toast.error }) },
          }),
        onError: toast.error,
      });
    },
    [adjust, toast],
  );

  const addToList = useAddPantryItemToList();
  // A second tap while the first add is in flight would add the item twice.
  const addingIds = useRef(new Set<string>());
  const addRowToList = useCallback(
    (item: PantryItem) => {
      if (addingIds.current.has(item.id)) return;
      addingIds.current.add(item.id);
      void addToList(item)
        .then((result) => toast.show(result))
        .finally(() => addingIds.current.delete(item.id));
    },
    [addToList, toast],
  );

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
    ({ item: row }: { item: PantryRow }) => {
      switch (row.kind) {
        case 'heading':
          return <SectionHeading title={row.title} emoji={row.emoji} count={row.count} first={row.first} />;
        case 'item':
          return (
            <PantryItemRow
              item={row.item}
              today={today}
              showEmoji={row.showEmoji}
              muted={row.muted}
              first={row.first}
              last={row.last}
              onOpen={openEdit}
              onUseOne={takeOne}
              onAddToList={addRowToList}
            />
          );
        case 'staples':
          return <StapleChips items={row.items} onOpen={openEdit} />;
        case 'ranOut':
          return (
            <RanOutToggle
              count={row.count}
              expanded={row.expanded}
              locked={searching}
              onToggle={() => setRanOutOpen((open) => !open)}
            />
          );
      }
    },
    [today, openEdit, takeOne, addRowToList, searching],
  );

  const sheets = (
    <>
      <AddFoodSheet visible={adding.visible} seed={adding.seed} onClose={() => setAdding((a) => ({ ...a, visible: false }))} />
      <EditItemSheet itemId={editing.id} visible={editing.visible} onClose={() => setEditing((e) => ({ ...e, visible: false }))} />
    </>
  );

  // First load, or failed with nothing to show.
  if (!hasData) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg }}>
        <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
          Pantry
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
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading the pantry" />
          </View>
        )}
        {sheets}
      </View>
    );
  }

  const showStarted = (empty || onlyStaples) && !searching;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}>
        <View style={{ gap: spacing.xs }}>
          <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink }]}>
            Pantry
          </Text>
          <Text style={[type.body, { color: colors.muted }]}>
            {pantrySummary(all.total - all.ranOut.length, all.expiring.length)}
          </Text>
        </View>
        {!empty ? <PantrySearch value={search} onChange={setSearch} /> : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 112 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          searching ? undefined : <ThisWeekCard />
        }
        ListEmptyComponent={
          searching && shown.total === 0 ? (
            <View
              style={{
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.xl,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: colors.outline,
              }}
            >
              <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>
                Nothing called &ldquo;{trimmed}&rdquo; in the pantry.
              </Text>
              <PrimaryPillButton title={`Add “${trimmed}”`} variant="outline" onPress={() => openAdd(trimmed)} />
            </View>
          ) : undefined
        }
        ListFooterComponent={
          showStarted && householdId ? (
            <View style={{ paddingTop: rows.length > 0 ? spacing.xl : 0 }}>
              <GettingStarted
                householdId={householdId}
                onlyStaples={onlyStaples}
                existingNames={existingNames}
                onAddFood={() => openAdd()}
              />
            </View>
          ) : undefined
        }
      />

      <View pointerEvents="box-none" style={{ position: 'absolute', right: spacing.lg, bottom: spacing.lg }}>
        <View
          style={{
            borderRadius: radius.pill,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 4,
          }}
        >
          <PrimaryPillButton title="Add food" onPress={() => openAdd()} />
        </View>
      </View>

      {sheets}
    </View>
  );
}
