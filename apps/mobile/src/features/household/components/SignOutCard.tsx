import { useState } from 'react';
import { Alert } from 'react-native';

import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { friendlyError } from '@/lib/household-settings';
import { supabase } from '@/lib/supabase';

import { SettingsCard } from './SettingsCard';

/** Temporary home for sign out until account settings land (P6). The route gate does the rest. */
export function SignOutCard({ email }: { email: string | null }) {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setBusy(false);
      Alert.alert("Couldn't sign out", friendlyError(error));
    }
  };

  return (
    <SettingsCard title="Account" description={email ? `Signed in as ${email}` : undefined}>
      <PrimaryPillButton title="Sign out" variant="outline" onPress={signOut} loading={busy} />
    </SettingsCard>
  );
}
