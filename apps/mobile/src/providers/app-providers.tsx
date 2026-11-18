import type { ReactNode } from 'react';

// Placeholder owned by the data layer worker (W3): Supabase session, TanStack Query with
// AsyncStorage persistence, refetch on resume, and the offline banner all mount here.
export function AppProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
