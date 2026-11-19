// Pure helpers for the Account screen. No React Native imports so Vitest can run them.
import type { AppApiFailure, DeleteAccountResponse } from '@lazychef/core/push/app-contract';

export const DISPLAY_NAME_MAX = 60;

/** Same rules and copy as the web app's updateDisplayName. Returns the trimmed name or an error. */
export function validateDisplayName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, error: "Your name can't be empty." };
  if (name.length > DISPLAY_NAME_MAX) return { ok: false, error: 'Keep it under 60 characters.' };
  return { ok: true, name };
}

/** One or two capital letters for the avatar: "Quinn Johnson" is "QJ", "quinn" is "Q", blank is "?". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toLocaleUpperCase();
}

/** The photo URL when it is a usable https URL (the same rule the database enforces), else null. */
export function avatarPhotoUrl(url: string | null | undefined): string | null {
  if (!url || url.length > 2048) return null;
  return /^https:\/\/[^\s/?#]+[^\s]*$/.test(url) ? url : null;
}

export const DELETE_CONFIRM = {
  title: 'Delete your account?',
  message:
    "Households where you're the only member are deleted with everything in them. Shared households pass to the next member and keep their data, with your name taken off. This can't be undone.",
  confirm: 'Delete my account',
} as const;

export const APPLE_REMOVE_NOTE =
  'To finish, remove LazyChef from your Apple ID: Settings, your name, Sign in with Apple, LazyChef, Stop Using Apple ID.';

export type DeleteOutcome =
  | { kind: 'deleted'; message: string; appleNote: string | null }
  | { kind: 'error'; message: string };

/** What to tell the person after the delete route answers. */
export function deleteOutcome(result: DeleteAccountResponse | AppApiFailure): DeleteOutcome {
  if (result.ok) {
    return {
      kind: 'deleted',
      message: 'Your account is deleted.',
      appleNote: result.appleNotRevoked ? APPLE_REMOVE_NOTE : null,
    };
  }
  switch (result.code) {
    case 'offline':
      return { kind: 'error', message: result.error || "You're offline. Try again when you're connected." };
    case 'not_configured':
      return {
        kind: 'error',
        message: result.error || "Deleting accounts isn't set up right now. Nothing was deleted. Try again later.",
      };
    default:
      return { kind: 'error', message: result.error || 'Something went wrong. Try again.' };
  }
}

/** "Cook 3 nights a week" (singular for one). */
export function goalLine(goal: number): string {
  return `Cook ${goal} ${goal === 1 ? 'night' : 'nights'} a week`;
}
