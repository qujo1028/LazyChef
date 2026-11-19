import { useState } from 'react';
import { Alert } from 'react-native';

import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { SettingsCard } from '@/features/household/components/SettingsCard';
import { unregisterThisDevice } from '@/features/push/device';
import { friendlyError } from '@/lib/household-settings';

import { signOutLocal } from '../api';

/** Sign out. The route gate sends the person to the welcome screen. */
export function SignOutCard() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    await unregisterThisDevice();
    const { error } = await signOutLocal();
    if (error) {
      setBusy(false);
      Alert.alert("Couldn't sign out", friendlyError(error));
    }
  };

  return (
    <SettingsCard title="Sign out">
      <PrimaryPillButton title="Sign out" variant="outline" onPress={signOut} loading={busy} />
    </SettingsCard>
  );
}
