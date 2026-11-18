import { useCallback, useState } from 'react';

import { signInWithApple } from '@/lib/auth/apple';
import { signInWithGoogle } from '@/lib/auth/google';
import type { SocialResult } from '@/lib/auth/google';

/** Runs Apple or Google sign in, one at a time, and keeps the message for a failure. */
export function useSocialSignIn() {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (which: 'apple' | 'google', task: () => Promise<SocialResult>) => {
    setBusy(which);
    setError(null);
    const result = await task();
    // On success the route gate swaps the screen, so there is nothing to do here.
    if (result.status === 'error') setError(result.message);
    setBusy(null);
  }, []);

  return {
    busy,
    error,
    apple: () => run('apple', signInWithApple),
    google: () => run('google', signInWithGoogle),
  };
}
