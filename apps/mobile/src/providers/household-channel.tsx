import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Database } from '@lazychef/db-types';

// Stub from the P1 lead. Owner: W4 realtime. Keep these exports and signatures (other features
// in P2 to P4 will call useHouseholdChanges), fill in the channel.

type TableName = keyof Database['public']['Tables'];
type Row<T extends TableName> = Database['public']['Tables'][T]['Row'];

/** A row change broadcast by the database (see private.broadcast_household_change). */
export type HouseholdChange<T extends TableName> = {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  record: Row<T> | null;
  oldRecord: Row<T> | null;
};

type Listener = (change: HouseholdChange<TableName>, table: TableName) => void;

const ListenersContext = createContext<Set<Listener> | null>(null);

/** One private Realtime channel per household (`household:<id>`). */
export function HouseholdChannelProvider({ householdId, children }: { householdId: string; children: ReactNode }) {
  void householdId;
  const [listeners] = useState(() => new Set<Listener>());
  return <ListenersContext.Provider value={listeners}>{children}</ListenersContext.Provider>;
}

/** Calls `onChange` whenever a housemate (or you, on another device) changes a row in `table`. */
export function useHouseholdChanges<T extends TableName>(table: T, onChange: (change: HouseholdChange<T>) => void) {
  const listeners = useContext(ListenersContext);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    if (!listeners) return;
    const listener: Listener = (change, changed) => {
      if (changed === table) latest.current(change as unknown as HouseholdChange<T>);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [listeners, table]);
}
