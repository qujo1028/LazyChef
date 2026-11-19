// Per-device consent before anything goes to the AI service (Apple guideline 5.1.2), same idea as
// the web's useAiConsent. Stored in AsyncStorage under a key that includes the wording of what is
// sent, so agreeing to one thing doesn't cover another and rewording asks again.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { consentKey } from '@/lib/ideas-copy';

/** `null` while the stored answer is being read. */
export function useAiConsent(sends: string): { consent: boolean | null; agree: () => void } {
  const [consent, setConsent] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(consentKey(sends))
      .then((value) => {
        if (active) setConsent(value === 'yes');
      })
      .catch(() => {
        if (active) setConsent(false);
      });
    return () => {
      active = false;
    };
  }, [sends]);

  const agree = useCallback(() => {
    setConsent(true);
    // If this fails they are simply asked again next time.
    AsyncStorage.setItem(consentKey(sends), 'yes').catch(() => {});
  }, [sends]);

  return { consent, agree };
}
