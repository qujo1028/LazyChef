import { useState } from 'react';
import { Alert } from 'react-native';
import type { AppApiFailure } from '@lazychef/core/push/app-contract';

import { FormMessage } from '@/components/FormMessage';
import { PrimaryPillButton } from '@/components/PrimaryPillButton';
import { SettingsCard } from '@/features/household/components/SettingsCard';
import { DELETE_CONFIRM, deleteOutcome, type DeleteOutcome } from '@/lib/account';

import { deleteAccount } from '../api';

const PREVIEWS: { title: string; run: () => DeleteOutcome }[] = [
  { title: 'Success', run: () => deleteOutcome({ ok: true, appleNotRevoked: false }) },
  { title: 'Apple note', run: () => deleteOutcome({ ok: true, appleNotRevoked: true }) },
  { title: 'Failure', run: () => deleteOutcome({ ok: false, code: 'failed', error: 'Delete failed.' } satisfies AppApiFailure) },
  { title: 'Offline', run: () => deleteOutcome({ ok: false, code: 'offline', error: '' }) },
  { title: 'Not set up', run: () => deleteOutcome({ ok: false, code: 'not_configured', error: '' }) },
];

/** Danger zone. Confirms with what will happen, then asks the server to delete the account. */
export function DeleteAccountCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeleteOutcome | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const outcome = await deleteAccount();
    // On success the phone signs out and this screen goes away; failures stay here.
    if (outcome.kind === 'error') setError(outcome.message);
    setBusy(false);
  };

  const confirm = () => {
    Alert.alert(DELETE_CONFIRM.title, DELETE_CONFIRM.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: DELETE_CONFIRM.confirm, style: 'destructive', onPress: () => void run() },
    ]);
  };

  return (
    <SettingsCard
      title="Delete account"
      description="Removes your account for good. Households you share keep their data with your name taken off."
    >
      {error ? <FormMessage tone="error" text={error} /> : null}
      <PrimaryPillButton title="Delete account" variant="danger" onPress={confirm} loading={busy} />
      {__DEV__ ? (
        <>
          {PREVIEWS.map((p) => (
            <PrimaryPillButton key={p.title} title={`Dev preview: ${p.title}`} variant="text" onPress={() => setPreview(p.run())} />
          ))}
          {preview ? (
            <FormMessage
              tone={preview.kind === 'deleted' ? 'success' : 'error'}
              text={preview.kind === 'deleted' ? [preview.message, preview.appleNote ?? ''].join(' ').trim() : preview.message}
            />
          ) : null}
        </>
      ) : null}
    </SettingsCard>
  );
}

