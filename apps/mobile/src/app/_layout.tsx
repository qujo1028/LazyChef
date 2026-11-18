import { Stack } from 'expo-router';

import { AppProviders } from '@/providers/app-providers';

// Owned by the shell and design worker (W2). Keep AppProviders as the outermost wrapper.
export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }} />
    </AppProviders>
  );
}
