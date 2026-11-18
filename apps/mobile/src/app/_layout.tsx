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

import { AppScreenHeader } from '@/components/AppScreenHeader';
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
  return (
    <>
      {/* Dark icons on cream, light icons in dark mode. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="activity"
          options={{
            header: () => <AppScreenHeader title="Activity" onBack={() => router.back()} />,
          }}
        />
      </Stack>
    </>
  );
}
