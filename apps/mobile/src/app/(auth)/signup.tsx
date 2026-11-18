import { Link, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Text, TextInput, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { TextField } from '@/components/TextField';
import { AuthFormLayout } from '@/features/auth/components/AuthFormLayout';
import { PasswordField } from '@/features/auth/components/PasswordField';
import { friendlyAuthError } from '@/lib/auth/errors';
import { authCallbackUrl } from '@/lib/auth/redirect';
import { supabase } from '@/lib/supabase';
import { fieldErrors, signUpInput } from '@lazychef/core/auth/forms';
import { PASSWORD_HINT } from '@lazychef/core/auth/schemas';
import { useTheme } from '@/theme';

export default function SignupScreen() {
  const { colors, spacing, type } = useTheme();
  const router = useRouter();
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/welcome'));

  async function submit() {
    if (loading) return;
    setFormError(null);
    const parsed = signUpInput.safeParse({ displayName, email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { display_name: parsed.data.displayName },
          emailRedirectTo: authCallbackUrl('/'),
        },
      });
      if (error) {
        setFormError(friendlyAuthError(error));
      } else if (!data.session) {
        // "Confirm email" is on: no session until they open the link.
        setSentTo(parsed.data.email);
      }
      // With a session, the route gate takes over.
    } catch (error) {
      setFormError(friendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <AuthFormLayout title="Check your email" onBack={goBack}>
        <View style={{ gap: spacing.lg }}>
          <FormMessage tone="success" text={`Almost there. Open the link we sent to ${sentTo} to finish signing up.`} />
          <Text style={[type.bodySmall, { color: colors.muted }]}>
            Open it on this phone so we can sign you in. Nothing there? Check your spam folder.
          </Text>
          <PrimaryPillButton title="Back to sign in" variant="outline" onPress={() => router.replace('/login')} />
        </View>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout title="Create your account" description="It takes a minute." onBack={goBack}>
      <View style={{ gap: spacing.lg }}>
        {formError ? <FormMessage tone="error" text={formError} /> : null}
        <TextField
          label="What should we call you?"
          value={displayName}
          onChangeText={setDisplayName}
          error={errors.displayName}
          autoCapitalize="words"
          textContentType="givenName"
          autoComplete="given-name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <TextField
          ref={emailRef}
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
          kind="new"
          label="Password"
          hint={PASSWORD_HINT}
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <PrimaryPillButton title="Create account" loading={loading} onPress={submit} />
        <View style={{ alignItems: 'center' }}>
          <Text style={[type.bodySmall, { color: colors.muted }]}>Already have an account?</Text>
          <Link replace href="/login" style={[type.button, { color: colors.primary, paddingVertical: spacing.sm }]}>
            Sign in
          </Link>
        </View>
      </View>
    </AuthFormLayout>
  );
}
