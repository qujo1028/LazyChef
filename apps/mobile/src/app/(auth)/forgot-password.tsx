import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { TextField } from '@/components/TextField';
import { AuthFormLayout } from '@/features/auth/components/AuthFormLayout';
import { friendlyAuthError } from '@/lib/auth/errors';
import { authCallbackUrl } from '@/lib/auth/redirect';
import { supabase } from '@/lib/supabase';
import { fieldErrors, forgotPasswordInput } from '@lazychef/core/auth/forms';
import { useTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const { spacing } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setFormError(null);
    setNotice(null);
    const parsed = forgotPasswordInput.safeParse({ email });
    if (!parsed.success) {
      setError(fieldErrors(parsed.error).email ?? null);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: authCallbackUrl('/reset-password'),
      });
      if (resetError) setFormError(friendlyAuthError(resetError));
      else setNotice('If that email has an account, a reset link is on its way. Open it on this phone.');
    } catch (caught) {
      setFormError(friendlyAuthError(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormLayout
      title="Reset your password"
      description="We'll email you a link to pick a new one."
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
    >
      <View style={{ gap: spacing.lg }}>
        {formError ? <FormMessage tone="error" text={formError} /> : null}
        {notice ? <FormMessage tone="success" text={notice} /> : null}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={error}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <PrimaryPillButton title="Send reset link" loading={loading} onPress={submit} />
      </View>
    </AuthFormLayout>
  );
}
