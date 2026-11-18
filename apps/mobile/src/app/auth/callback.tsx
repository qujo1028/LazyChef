import { safeNext } from '@lazychef/core/auth/safe-next';
import type { EmailOtpType } from '@supabase/supabase-js';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { callbackParamsFromSearch } from '@/lib/auth/callback-url';
import { friendlyAuthError, friendlyCallbackError, GENERIC_AUTH_ERROR } from '@/lib/auth/errors';
import { exchangeCodeOnce } from '@/lib/auth/redirect';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

const EMAIL_OTP_TYPES = new Set<string>(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']);

/** Finishes an email link or OAuth return: exchanges the code, then goes on to `next` (or `/`). */
export default function AuthCallbackScreen() {
  const { colors, spacing, type } = useTheme();
  const router = useRouter();
  const search = useLocalSearchParams();
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // Strict mode and re-renders must not run the exchange twice.
    if (started.current) return;
    started.current = true;

    const params = callbackParamsFromSearch(search);
    const next = safeNext(params.next, '/') as Href;

    (async () => {
      if (params.error) {
        setFailure(friendlyCallbackError(params.error, params.errorDescription));
        return;
      }
      if (params.code) {
        const error = await exchangeCodeOnce(params.code);
        if (error) {
          setFailure(friendlyAuthError(error));
          return;
        }
        router.replace(next);
        return;
      }
      // Email templates that send ?token_hash=&type= (see README), as on the web callback.
      if (params.tokenHash && params.type && EMAIL_OTP_TYPES.has(params.type)) {
        const { error } = await supabase.auth.verifyOtp({
          type: params.type as EmailOtpType,
          token_hash: params.tokenHash,
        });
        if (error) {
          setFailure(friendlyAuthError(error));
          return;
        }
        router.replace(params.type === 'recovery' ? '/reset-password' : next);
        return;
      }
      // No code: maybe a session already exists (for example the link was handled once).
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace(next);
      else setFailure(GENERIC_AUTH_ERROR);
    })().catch((error) => setFailure(friendlyAuthError(error)));
  }, [router, search]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        padding: spacing.xl,
        backgroundColor: colors.background,
      }}
    >
      {failure ? (
        <>
          <Text accessibilityRole="header" style={[type.titleSmall, { color: colors.ink, textAlign: 'center' }]}>
            {"That didn't work"}
          </Text>
          <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{failure}</Text>
          <PrimaryPillButton title="Back to sign in" onPress={() => router.replace('/')} />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.primary} />
          <Text accessibilityLiveRegion="polite" style={[type.body, { color: colors.muted }]}>
            Signing you in
          </Text>
        </>
      )}
    </View>
  );
}
