import { useQuery } from '@tanstack/react-query';
import {
  applyOverrides,
  beginAdjust,
  changeFromBroadcast,
  endAdjust,
  initialPantryState,
  reducePantry,
  type PantryChange,
  type PantryItems,
  type QuantityOverrides,
} from '@lazychef/core/pantry/pantry-state';
import type { PantryItem } from '@lazychef/core/pantry/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { queryKeys } from '@/lib/household';
import { useHouseholdChanges } from '@/providers/household-channel';

import { adjustQuantity, fetchPantryItems } from './api';

export type AdjustOptions = {
  /** After the server confirms, with the new amount. */
  onDone?: (quantity: number) => void;
  /** When the change failed, with a message to show. */
  onError?: (message: string) => void;
};

type PantryValue = {
  householdId: string | null;
  /** The live pantry: last fetch, plus housemates' changes, plus our optimistic edits. */
  items: PantryItems;
  /** The query, for loading, error and pull to refresh states. */
  query: ReturnType<typeof usePantryQuery>;
  /** Applies a change locally (optimistic edit, or a server result). */
  apply: (change: PantryChange) => void;
  /** Changes an amount by `delta` (e.g. -1), showing it right away. */
  adjust: (id: string, delta: number, options?: AdjustOptions) => void;
};

const PantryContext = createContext<PantryValue | null>(null);

function usePantryQuery(householdId: string | null) {
  return useQuery({
    queryKey: queryKeys.pantry(householdId ?? 'none'),
    enabled: householdId !== null,
    queryFn: async () => {
      // Taken before the read, so rows that change meanwhile count as newer than the snapshot.
      const fetchedAt = Date.now();
      const items = await fetchPantryItems(householdId!);
      return { items, fetchedAt };
    },
  });
}

/**
 * The household's pantry, kept live: each fetch (first load, pull to refresh, resume, a
 * household-wide refetch) is merged in with the same newest-row-wins rules as the web app
 * (packages/core/src/state/row-state.ts), and pantry_items broadcasts apply as they arrive.
 * Mounted once in the tabs layout so every tab (and later, recipes and cooking) shares it.
 */
export function PantryProvider({ householdId, children }: { householdId: string | null; children: ReactNode }) {
  const query = usePantryQuery(householdId);
  const [state, setState] = useState(() => initialPantryState([]));
  const [synced, setSynced] = useState<typeof query.data>(undefined);
  const [syncedHousehold, setSyncedHousehold] = useState(householdId);
  const [overrides, setOverrides] = useState<QuantityOverrides>(() => new Map());

  // A different household: start over.
  if (syncedHousehold !== householdId) {
    setSyncedHousehold(householdId);
    setSynced(undefined);
    setState(initialPantryState([]));
    setOverrides(new Map());
  }

  // A new fetch (or the persisted cache on a cold start): merge it in.
  if (query.data && query.data !== synced && syncedHousehold === householdId) {
    setSynced(query.data);
    setState((current) => reducePantry(current, { type: 'sync', items: query.data.items, fetchedAt: query.data.fetchedAt }));
  }

  const apply = useCallback((change: PantryChange) => setState((current) => reducePantry(current, change)), []);

  useHouseholdChanges('pantry_items', (broadcast) => {
    if (!householdId) return;
    const change = changeFromBroadcast(broadcast, householdId);
    if (change) apply(change);
  });

  const items = useMemo(() => applyOverrides(state.items, overrides), [state.items, overrides]);

  // Handlers read the latest items without re-creating callbacks.
  const latest = useRef(items);
  useEffect(() => {
    latest.current = items;
  }, [items]);

  const adjust = useCallback(
    (id: string, delta: number, options: AdjustOptions = {}) => {
      const item = latest.current.get(id);
      if (!item) return;
      setOverrides((current) => beginAdjust(current, id, (item.quantity ?? 0) + delta));
      void adjustQuantity(id, delta).then((result) => {
        // The full row carries the new updated_at, so an older snapshot can't win over it.
        if (result.error === undefined) apply({ type: 'upsert', item: result.item });
        setOverrides((current) => endAdjust(current, id));
        if (result.error !== undefined) options.onError?.(result.error);
        else options.onDone?.(Number(result.item.quantity ?? 0));
      });
    },
    [apply],
  );

  const value = useMemo<PantryValue>(
    () => ({ householdId, items, query, apply, adjust }),
    [householdId, items, query, apply, adjust],
  );
  return <PantryContext.Provider value={value}>{children}</PantryContext.Provider>;
}

/** The live pantry. Must be inside PantryProvider (the tabs layout mounts it). */
export function usePantry(): PantryValue {
  const value = useContext(PantryContext);
  if (!value) throw new Error('usePantry must be used inside PantryProvider');
  return value;
}

/** The live row for `id`, or null once it's gone. */
export function usePantryItem(id: string | null): PantryItem | null {
  const { items } = usePantry();
  return id ? (items.get(id) ?? null) : null;
}
