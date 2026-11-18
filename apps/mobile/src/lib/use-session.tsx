import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

type SessionState = { session: Session | null; loading: boolean };

const SessionContext = createContext<SessionState | null>(null);

/** One auth listener for the whole app. Mounted by AppProviders. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      // Only fills the first value: if the auth listener already reported, its session is newer.
      .then(({ data }) => {
        if (active) setState((prev) => (prev.loading ? { session: data.session, loading: false } : prev));
      })
      .catch(() => {
        // Unreadable storage counts as signed out.
        if (active) setState((prev) => (prev.loading ? { session: null, loading: false } : prev));
      });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setState({ session: next, loading: false });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

/** Current Supabase session plus whether the stored session is still being read. */
export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error('useSession must be used inside SessionProvider');
  return state;
}
