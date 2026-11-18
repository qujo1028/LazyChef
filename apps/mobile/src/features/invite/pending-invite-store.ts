import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { parsePendingInvite, serializePendingInvite } from '@/lib/pending-invite';

// Not a secret (anyone with the link has it), so AsyncStorage rather than the secure store.
const KEY = 'lazychef.pending-invite';

/** Remembers an invite link opened while signed out. Storage errors are swallowed: it's a convenience. */
export async function savePendingInvite(rawCode: string): Promise<void> {
  const value = serializePendingInvite(rawCode, Date.now());
  if (!value) return;
  try {
    await AsyncStorage.setItem(KEY, value);
  } catch {
    // Nothing to do: the person can still enter the code by hand.
  }
}

export async function readPendingInvite(): Promise<string | null> {
  try {
    return parsePendingInvite(await AsyncStorage.getItem(KEY), Date.now());
  } catch {
    return null;
  }
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Expires on its own after 7 days.
  }
}

/** The pending invite code, read once on mount. `clear()` forgets it here and in storage. */
export function usePendingInvite() {
  const [state, setState] = useState<{ code: string | null; loaded: boolean }>({ code: null, loaded: false });

  useEffect(() => {
    let active = true;
    readPendingInvite().then((code) => {
      if (active) setState({ code, loaded: true });
    });
    return () => {
      active = false;
    };
  }, []);

  const clear = useCallback(() => {
    setState({ code: null, loaded: true });
    return clearPendingInvite();
  }, []);

  return { ...state, clear };
}
