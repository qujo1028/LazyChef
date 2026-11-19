// Must load first: a standard URL for supabase-js and the @lazychef/core auth helpers.
import 'react-native-url-polyfill/auto';

import { LibreCaslonDisplay_400Regular } from '@expo-google-fonts/libre-caslon-display';
import {
  SourceSans3_400Regular,
  SourceSans3_500Medium,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
} from '@expo-google-fonts/source-sans-3';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { AppScreenHeader } from '@/components/AppScreenHeader';
import { EmptyState } from '@/components/EmptyState';
import { PushBridge } from '@/features/push/PushBridge';
import { useHouseholdContext } from '@/lib/household';
import { useSession } from '@/lib/use-session';
import { AppProviders } from '@/providers/app-providers';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    LibreCaslonDisplay_400Regular,
    SourceSans3_400Regular,
    SourceSans3_500Medium,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
  });
  // On a font error we still show the app (system font) rather than hang on the splash.
  const ready = loaded || error != null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  return <AppProviders>{ready ? <Navigation /> : null}</AppProviders>;
}

function Navigation() {
  const { scheme, colors } = useTheme();
  const router = useRouter();
  const { session, loading } = useSession();
  const context = useHouseholdContext();

  const signedIn = session !== null;
  // Hold on a blank screen until we know which group to show, so nobody sees the wrong one flash.
  const waiting = loading || (signedIn && context.isPending);
  if (waiting) {
    // Offline with nothing cached: the query is paused, so say so instead of a blank screen.
    // The offline banner is already showing above this, and the query resumes on reconnect.
    const paused = signedIn && context.fetchStatus === 'paused';
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center', backgroundColor: colors.background }}>
        {paused ? <EmptyState title="You're offline" line="Connect to the internet to load your household." /> : null}
      </View>
    );
  }
  const hasHousehold = (context.data?.memberships.length ?? 0) > 0;

  return (
    <>
      {/* Dark icons on cream, light icons in dark mode. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Push registration on resume, the foreground toast and tap deep links (P6). */}
      {signedIn && hasHousehold ? <PushBridge /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {/* Always reachable: they work out the session state themselves. */}
        <Stack.Screen name="index" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="join/[code]" />

        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !hasHousehold}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && hasHousehold}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="activity"
            options={{
              headerShown: true,
              header: () => <AppScreenHeader title="Activity" onBack={() => router.back()} />,
            }}
          />
          <Stack.Screen
            name="account"
            options={{
              headerShown: true,
              header: () => <AppScreenHeader title="Account" onBack={() => router.back()} />,
            }}
          />
          <Stack.Screen
            name="recipe/[id]"
            options={{
              headerShown: true,
              header: () => <AppScreenHeader title="Recipe" onBack={() => router.back()} />,
            }}
          />
        </Stack.Protected>
      </Stack>
    </>
  );
}
