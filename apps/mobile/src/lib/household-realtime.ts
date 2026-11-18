import type { Database } from '@lazychef/db-types';

// Pure helpers for the household Realtime channel (providers/household-channel.tsx).
// No React Native imports here so Vitest can run them.

export type TableName = keyof Database['public']['Tables'];
type Row<T extends TableName> = Database['public']['Tables'][T]['Row'];

/** A row change broadcast by the database (see private.broadcast_household_change). */
export type HouseholdChange<T extends TableName> = {
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  /** The new row (null for DELETE). */
  record: Row<T> | null;
  /** The previous row (null for INSERT). */
  oldRecord: Row<T> | null;
};

/** Tables whose changes refetch every household query instead of being patched in place. */
export const REFRESH_TABLES: ReadonlySet<string> = new Set(['households', 'household_members']);

export function householdTopic(householdId: string): string {
  return `household:${householdId}`;
}

export type BroadcastAction =
  | { kind: 'refresh' }
  | { kind: 'change'; table: TableName; change: HouseholdChange<TableName> };

const OPERATIONS = new Set(['INSERT', 'UPDATE', 'DELETE']);

/**
 * Maps a `realtime.broadcast_changes` payload to what the provider should do.
 * Same mapping as the web provider; returns null for anything it does not recognise.
 */
export function parseBroadcast(payload: unknown): BroadcastAction | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const table = p.table;
  if (typeof table !== 'string' || table === '') return null;
  if (REFRESH_TABLES.has(table)) return { kind: 'refresh' };
  if (typeof p.operation !== 'string' || !OPERATIONS.has(p.operation)) return null;
  return {
    kind: 'change',
    table: table as TableName,
    change: {
      operation: p.operation as HouseholdChange<TableName>['operation'],
      record: (p.record ?? null) as HouseholdChange<TableName>['record'],
      oldRecord: (p.old_record ?? null) as HouseholdChange<TableName>['oldRecord'],
    },
  };
}

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;

/**
 * Delay before resubscribe attempt `attempt` (0 based): 1s, 2s, 4s ... capped at 30s.
 * `random` (0 to 1) adds jitter in the upper half of the delay so many phones
 * do not reconnect in lockstep after an outage. Pass `() => 1` for no jitter.
 */
export function backoffDelay(
  attempt: number,
  random: () => number = Math.random,
  baseMs = BACKOFF_BASE_MS,
  maxMs = BACKOFF_MAX_MS,
): number {
  const n = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  // Cap the exponent too, so a huge attempt count cannot overflow to Infinity.
  const full = Math.min(maxMs, baseMs * 2 ** Math.min(n, 30));
  const r = Math.min(1, Math.max(0, random()));
  return Math.round(full / 2 + (full / 2) * r);
}

/** Subscribe statuses that mean the channel is gone and should be resubscribed. */
export function isChannelFailure(status: string): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED';
}

export type ChannelStatus = 'connecting' | 'live' | 'offline';

/** What the UI should show: offline without network or in the background, live once subscribed. */
export function channelStatus(state: { online: boolean; foreground: boolean; subscribed: boolean }): ChannelStatus {
  if (!state.online || !state.foreground) return 'offline';
  return state.subscribed ? 'live' : 'connecting';
}

/** NetInfo state to online. Unknown reachability (null) counts as online, like query-client.ts. */
export function isOnline(state: { isConnected: boolean | null; isInternetReachable?: boolean | null }): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}
