import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { supabase } from './supabase';

export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      // Must be at least the persist maxAge or restored data is garbage collected early.
      gcTime: CACHE_MAX_AGE,
      retry: 2,
      // Show cached data offline and refetch on reconnect instead of failing.
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
    },
    mutations: { networkMode: 'online' },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'lazychef-query-cache',
  throttleTime: 1000,
});

// A new app version drops the old cache, since cached shapes may have changed.
export const cacheBuster = Constants.expoConfig?.version ?? '0';

// Refetch when the app returns to the foreground. (On web, TanStack uses visibilitychange.)
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => sub.remove();
  });
}

// Tie TanStack's online state to NetInfo. Unknown reachability (null) counts as online.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  }),
);

// Household data must not outlive the session, in memory or in AsyncStorage.
let lastUserId: string | null = null;
supabase.auth.onAuthStateChange((event, session) => {
  const userId = session?.user.id ?? null;
  // Sign out, or a different account signing in without a sign out in between.
  const switched = userId !== null && lastUserId !== null && userId !== lastUserId;
  if (event === 'SIGNED_OUT' || switched) {
    queryClient.clear();
    void queryPersister.removeClient();
  }
  if (event === 'SIGNED_OUT') lastUserId = null;
  else if (userId) lastUserId = userId;
});
