// A one-shot message the sign-in screen shows after the account was deleted. In memory on purpose:
// it only needs to survive the sign out that follows, not an app restart.
import { useSyncExternalStore } from 'react';

export type AccountNotice = { message: string; appleNote: string | null };

let notice: AccountNotice | null = null;
const listeners = new Set<() => void>();

export function setAccountNotice(next: AccountNotice | null): void {
  notice = next;
  listeners.forEach((l) => l());
}

export function useAccountNotice(): AccountNotice | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => notice,
    () => null,
  );
}
