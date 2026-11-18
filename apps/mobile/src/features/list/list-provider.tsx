import { useQuery } from '@tanstack/react-query';
import { displayName } from '@lazychef/core/pantry/display';
import {
  applyChecked,
  beginCheck,
  endCheck,
  initialListState,
  listChangeFromBroadcast,
  reduceList,
  type CheckedOverrides,
  type ListChange,
  type ListItems,
} from '@lazychef/core/list/list-state';
import type { ListItem } from '@lazychef/core/list/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useToast } from '@/components/Toast';
import { queryKeys } from '@/lib/household';
import { useSession } from '@/lib/use-session';
import { useHouseholdChanges } from '@/providers/household-channel';

import { fetchListItems, setChecked } from './api';

type ListValue = {
  householdId: string | null;
  /** The live list: last fetch, plus housemates' changes, plus our optimistic checks. */
  items: ListItems;
  /** The query, for loading, error and pull to refresh states. */
  query: ReturnType<typeof useListQuery>;
  apply: (change: ListChange) => void;
  /** Checks a line off (or back on) right away; the server catches up. Errors show a toast. */
  setItemChecked: (id: string, checked: boolean) => void;
  /** A tap on a line: checks it off (toast with Undo) or back on. */
  toggle: (id: string) => void;
};

const ListContext = createContext<ListValue | null>(null);

function useListQuery(householdId: string | null) {
  return useQuery({
    queryKey: queryKeys.list(householdId ?? 'none'),
    enabled: householdId !== null,
    queryFn: async () => {
      const fetchedAt = Date.now();
      const items = await fetchListItems(householdId!);
      return { items, fetchedAt };
    },
  });
}

/**
 * The household's shopping list, kept live the same way as PantryProvider: fetches merge
 * with newest-row-wins rules and shopping_list_items broadcasts apply as they arrive.
 * Mounted once in the tabs layout, so the pantry and (later) recipes can add to it.
 */
export function ListProvider({ householdId, children }: { householdId: string | null; children: ReactNode }) {
  const query = useListQuery(householdId);
  const { session } = useSession();
  const viewerId = session?.user.id ?? '';
  const toast = useToast();
  const [state, setState] = useState(() => initialListState([]));
  const [synced, setSynced] = useState<typeof query.data>(undefined);
  const [syncedHousehold, setSyncedHousehold] = useState(householdId);
  const [overrides, setOverrides] = useState<CheckedOverrides>(() => new Map());

  if (syncedHousehold !== householdId) {
    setSyncedHousehold(householdId);
    setSynced(undefined);
    setState(initialListState([]));
    setOverrides(new Map());
  }

  if (query.data && query.data !== synced && syncedHousehold === householdId) {
    setSynced(query.data);
    setState((current) => reduceList(current, { type: 'sync', items: query.data.items, fetchedAt: query.data.fetchedAt }));
  }

  const apply = useCallback((change: ListChange) => setState((current) => reduceList(current, change)), []);

  useHouseholdChanges('shopping_list_items', (broadcast) => {
    if (!householdId) return;
    const change = listChangeFromBroadcast(broadcast, householdId);
    if (change) apply(change);
  });

  const items = useMemo(() => applyChecked(state.items, overrides, viewerId), [state.items, overrides, viewerId]);

  const latest = useRef(items);
  useEffect(() => {
    latest.current = items;
  }, [items]);

  const setItemChecked = useCallback(
    (id: string, checked: boolean) => {
      const item = latest.current.get(id);
      if (!item || !householdId || (item.checked_at !== null) === checked) return;
      setOverrides((current) => beginCheck(current, id, checked ? new Date().toISOString() : null));
      void setChecked(householdId, id, checked).then((result) => {
        if (result.error === undefined) apply({ type: 'upsert', item: result.item });
        setOverrides((current) => endCheck(current, id));
        if (result.error !== undefined) toast.show({ id: `check-${id}`, message: result.error, tone: 'error' });
      });
    },
    [apply, householdId, toast],
  );

  const toggle = useCallback(
    (id: string) => {
      const item = latest.current.get(id);
      if (!item) return;
      const checking = item.checked_at === null;
      setItemChecked(id, checking);
      if (checking) {
        toast.show({
          id: `check-${id}`,
          message: `Checked off ${displayName(item.name).toLowerCase()}`,
          action: { label: 'Undo', onPress: () => setItemChecked(id, false) },
        });
      }
    },
    [setItemChecked, toast],
  );

  const value = useMemo<ListValue>(
    () => ({ householdId, items, query, apply, setItemChecked, toggle }),
    [householdId, items, query, apply, setItemChecked, toggle],
  );
  return <ListContext.Provider value={value}>{children}</ListContext.Provider>;
}

/** The live shopping list. Must be inside ListProvider (the tabs layout mounts it). */
export function useList(): ListValue {
  const value = useContext(ListContext);
  if (!value) throw new Error('useList must be used inside ListProvider');
  return value;
}

/** The live line for `id`, or null once it's gone. */
export function useListItem(id: string | null): ListItem | null {
  const { items } = useList();
  return id ? (items.get(id) ?? null) : null;
}
