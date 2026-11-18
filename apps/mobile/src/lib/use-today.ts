import { localDateKey } from '@lazychef/core/dates/days';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Today's date key (YYYY-MM-DD, local time). Rolls over at midnight and when the app comes back. */
export function useToday(): string {
  const [today, setToday] = useState(() => localDateKey());
  useEffect(() => {
    const refresh = () => setToday(localDateKey());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(refresh, midnight.getTime() - now.getTime());
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [today]);
  return today;
}
