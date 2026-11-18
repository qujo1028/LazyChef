import { Link, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Text, TextInput, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { TextField } from '@/components/TextField';
import { AuthFormLayout } from '@/features/auth/components/AuthFormLayout';
import { PasswordField } from '@/features/auth/components/PasswordField';
import { friendlyAuthError } from '@/lib/auth/errors';
import { supabase } from '@/lib/supabase';
import { fieldErrors, signInInput } from '@lazychef/core/auth/forms';
import { useTheme } from '@/theme';

export default function LoginScreen() {
  const { colors, spacing, type } = useTheme();
  const router = useRouter();
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setFormError(null);
    const parsed = signInInput.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      // On success the route gate takes over.
      if (error) setFormError(friendlyAuthError(error));
    } catch (error) {
      setFormError(friendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormLayout
      title="Sign in"
      description="Welcome back."
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
    >
      <View style={{ gap: spacing.lg }}>
        {formError ? <FormMessage tone="error" text={formError} /> : null}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <PasswordField
          ref={passwordRef}
          kind="current"
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <PrimaryPillButton title="Sign in" loading={loading} onPress={submit} />
        <View style={{ gap: spacing.xs, alignItems: 'center' }}>
          <Link href="/forgot-password" style={[type.button, { color: colors.primary, paddingVertical: spacing.sm }]}>
            Forgot your password?
          </Link>
          <Text style={[type.bodySmall, { color: colors.muted }]}>New here?</Text>
          <Link replace href="/signup" style={[type.button, { color: colors.primary, paddingVertical: spacing.sm }]}>
            Create an account
          </Link>
        </View>
      </View>
    </AuthFormLayout>
  );
}
