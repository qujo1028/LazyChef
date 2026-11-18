import { useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Text, TextInput, View } from 'react-native';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { AuthFormLayout } from '@/features/auth/components/AuthFormLayout';
import { PasswordField } from '@/features/auth/components/PasswordField';
import { friendlyAuthError } from '@/lib/auth/errors';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import { fieldErrors, resetPasswordInput } from '@lazychef/core/auth/forms';
import { PASSWORD_HINT } from '@lazychef/core/auth/schemas';
import { useTheme } from '@/theme';

/** Where the reset email lands (through /auth/callback, which signs them in first). */
export default function ResetPasswordScreen() {
  const { colors, spacing, type } = useTheme();
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setFormError(null);
    const parsed = resetPasswordInput.safeParse({ password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (error) setFormError(friendlyAuthError(error));
      else router.replace('/');
    } catch (caught) {
      setFormError(friendlyAuthError(caught));
    } finally {
      setLoading(false);
    }
  }

  if (!sessionLoading && !session) {
    return (
      <AuthFormLayout title="Link expired">
        <View style={{ gap: spacing.lg }}>
          <Text style={[type.body, { color: colors.muted }]}>
            {"That reset link didn't work. It may have expired or been opened on another device."}
          </Text>
          <PrimaryPillButton title="Send a new link" onPress={() => router.replace('/forgot-password')} />
        </View>
      </AuthFormLayout>
    );
  }

  return (
    <AuthFormLayout title="Choose a new password">
      <View style={{ gap: spacing.lg }}>
        {formError ? <FormMessage tone="error" text={formError} /> : null}
        <PasswordField
          kind="new"
          label="New password"
          hint={PASSWORD_HINT}
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <PasswordField
          ref={confirmRef}
          kind="new"
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <PrimaryPillButton title="Save password" loading={loading} onPress={submit} />
      </View>
    </AuthFormLayout>
  );
}
