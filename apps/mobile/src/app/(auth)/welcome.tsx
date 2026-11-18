import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { AppleSignInButton } from '@/features/auth/components/AppleSignInButton';
import { useSocialSignIn } from '@/features/auth/use-social-sign-in';
import { useTheme } from '@/theme';

export default function WelcomeScreen() {
  const { colors, spacing, type } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const social = useSocialSignIn();
  const busy = social.busy !== null;

  return (
    <View
      style={[
        styles.fill,
        {
          backgroundColor: colors.background,
          paddingHorizontal: spacing.lg,
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}
    >
      <View style={[styles.hero, { gap: spacing.md }]}>
        <Text accessibilityRole="header" style={[type.title, styles.name, { color: colors.ink }]}>
          LazyChef
        </Text>
        <Text style={[type.body, { color: colors.muted }]}>
          One shared pantry, shopping list and recipe finder for your household.
        </Text>
      </View>

      <View style={{ gap: spacing.md }}>
        {social.error ? <FormMessage tone="error" text={social.error} /> : null}
        <AppleSignInButton onPress={social.apple} disabled={busy} />
        <PrimaryPillButton
          title="Continue with Google"
          variant="outline"
          loading={social.busy === 'google'}
          disabled={busy}
          onPress={social.google}
        />
        <PrimaryPillButton title="Sign in with email" disabled={busy} onPress={() => router.push('/login')} />
        <PrimaryPillButton title="Create an account" variant="text" disabled={busy} onPress={() => router.push('/signup')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hero: { flex: 1, justifyContent: 'center' },
  name: { fontSize: 44, lineHeight: 50 },
});
