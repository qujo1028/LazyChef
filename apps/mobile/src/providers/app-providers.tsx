import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { cacheBuster, CACHE_MAX_AGE, queryClient, queryPersister } from '@/lib/query-client';
import { useOffline } from '@/lib/use-offline';

import { OfflineBanner } from './offline-banner';

function OfflineLayer({ children }: { children: ReactNode }) {
  const offline = useOffline();
  const insets = useSafeAreaInsets();
  // While the banner is showing it already covers the status bar inset, so screens below it
  // must not pad for it a second time.
  const childInsets = offline ? { ...insets, top: 0 } : insets;
  return (
    <View style={styles.fill}>
      {offline ? <OfflineBanner /> : null}
      <SafeAreaInsetsContext.Provider value={childInsets}>
        <View style={styles.fill}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

// Data providers only; no navigation code. Must render inside the router's SafeAreaProvider.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: CACHE_MAX_AGE, buster: cacheBuster }}
    >
      <OfflineLayer>{children}</OfflineLayer>
    </PersistQueryClientProvider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
