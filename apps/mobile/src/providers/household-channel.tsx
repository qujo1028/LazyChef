import NetInfo from '@react-native-community/netinfo';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { queryKeys } from '@/lib/household';
import {
  backoffDelay,
  channelStatus,
  householdTopic,
  isChannelFailure,
  isOnline,
  parseBroadcast,
  type ChannelStatus,
  type HouseholdChange,
  type TableName,
} from '@/lib/household-realtime';
import { supabase } from '@/lib/supabase';

export type { ChannelStatus, HouseholdChange } from '@/lib/household-realtime';

type Listener = (change: HouseholdChange<TableName>, table: TableName) => void;

const ListenersContext = createContext<Set<Listener> | null>(null);
const StatusContext = createContext<ChannelStatus>('offline');

// Channel operations (remove, setAuth, create) run one at a time across every provider
// instance. supabase.channel() hands back an existing channel with the same topic, so a
// remount or household switch must finish removing the old channel before a new one starts.
let channelOps: Promise<void> = Promise.resolve();
function runChannelOp(op: () => Promise<void>) {
  channelOps = channelOps.then(op).catch((error: unknown) => {
    if (__DEV__) console.warn('[realtime] channel operation failed', error);
  });
}

/**
 * One private Realtime channel per household (`household:<id>`, authorized by RLS on
 * realtime.messages). Changes to `households` and `household_members` refetch every
 * household query; other tables go to components that called useHouseholdChanges().
 *
 * The channel is dropped in the background and while offline, and resubscribed on
 * resume or reconnect, followed by a refetch because broadcasts were missed meanwhile.
 * Failures (error, timeout, unexpected close) resubscribe with capped backoff.
 */
export function HouseholdChannelProvider({
  householdId,
  children,
}: {
  /** Null renders the children without a channel, so the tree doesn't remount when a household appears. */
  householdId: string | null;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [listeners] = useState(() => new Set<Listener>());
  const [status, setStatus] = useState<ChannelStatus>('connecting');

  useEffect(() => {
    if (!householdId) return;
    let disposed = false;
    let signedIn = true;
    let foreground = AppState.currentState !== 'background';
    let online = true;
    let channel: RealtimeChannel | null = null;
    let subscribed = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // Set while the channel is not live, so the next SUBSCRIBED refetches what was missed.
    let missed = false;

    const wanted = () => !disposed && signedIn && foreground && online;
    const report = () => {
      if (!disposed) setStatus(channelStatus({ online: online && signedIn, foreground, subscribed }));
    };
    const refetchHousehold = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.all });
    };
    const clearRetry = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };

    // Forget the current channel first, so its CLOSED callback is ignored as intentional.
    const drop = async () => {
      const old = channel;
      channel = null;
      subscribed = false;
      if (old) await supabase.removeChannel(old);
    };

    const scheduleRetry = () => {
      if (retryTimer || !wanted()) return;
      const delay = backoffDelay(attempt);
      attempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        runChannelOp(open);
      }, delay);
    };

    const open = async () => {
      await drop();
      if (!wanted()) return;
      // Hand the socket the current (refreshed if needed) access token before joining.
      try {
        await supabase.realtime.setAuth();
      } catch (error) {
        if (__DEV__) console.warn('[realtime] setAuth failed', error);
        missed = true;
        report();
        scheduleRetry();
        return;
      }
      if (!wanted() || channel) return;

      const ch = supabase.channel(householdTopic(householdId), { config: { private: true } });
      channel = ch;
      ch.on('broadcast', { event: '*' }, ({ payload }) => {
        if (ch !== channel) return;
        const action = parseBroadcast(payload);
        if (!action) return;
        if (action.kind === 'refresh') {
          refetchHousehold();
          return;
        }
        for (const listener of listeners) {
          // One broken listener must not stop the others from hearing the change.
          try {
            listener(action.change, action.table);
          } catch (error) {
            if (__DEV__) console.warn('[realtime] listener failed', error);
          }
        }
      }).subscribe((state, error) => {
        if (ch !== channel || disposed) return;
        if (state === 'SUBSCRIBED') {
          subscribed = true;
          attempt = 0;
          clearRetry();
          if (missed) {
            missed = false;
            refetchHousehold();
          }
          report();
          return;
        }
        if (isChannelFailure(state)) {
          if (__DEV__) console.warn(`[realtime] ${state}`, error ?? '');
          subscribed = false;
          missed = true;
          report();
          scheduleRetry();
        }
      });
    };

    // Bring the channel in line with foreground, network and session state.
    const sync = () => {
      clearRetry();
      attempt = 0;
      report();
      if (wanted()) {
        missed = true;
        runChannelOp(open);
      } else {
        runChannelOp(drop);
      }
    };

    runChannelOp(open);

    const appState = AppState.addEventListener('change', (next) => {
      // 'inactive' (iOS app switcher, Control Center) keeps the channel.
      const nextForeground = next === 'active' ? true : next === 'background' ? false : foreground;
      if (nextForeground === foreground) return;
      foreground = nextForeground;
      sync();
    });

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const nextOnline = isOnline(state);
      if (nextOnline === online) return;
      online = nextOnline;
      sync();
    });

    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        signedIn = false;
        sync();
      } else if (event === 'SIGNED_IN' && !signedIn) {
        signedIn = true;
        sync();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        // Keep long sessions authorized. Uses the token from the event: calling auth
        // methods inside this callback can deadlock supabase-js.
        const token = session.access_token;
        runChannelOp(() => supabase.realtime.setAuth(token));
      }
    });

    return () => {
      disposed = true;
      clearRetry();
      appState.remove();
      unsubscribeNetInfo();
      auth.subscription.unsubscribe();
      runChannelOp(drop);
    };
  }, [householdId, listeners, queryClient]);

  useEffect(() => {
    if (__DEV__) console.log(`[realtime] household channel ${status}`);
  }, [status]);

  return (
    <StatusContext.Provider value={householdId ? status : 'offline'}>
      <ListenersContext.Provider value={listeners}>{children}</ListenersContext.Provider>
    </StatusContext.Provider>
  );
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

/** Live once the household channel is subscribed; offline in the background, without network, or outside the provider. */
export function useHouseholdChannelStatus(): ChannelStatus {
  return useContext(StatusContext);
}
