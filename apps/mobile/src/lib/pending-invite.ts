// Pure parts of the pending invite: an invite link opened while signed out is remembered so
// onboarding can offer it after sign in. Storage lives in features/invite/pending-invite-store.ts.
import { cleanInviteCode } from './invite-code';

/** Same lifetime as the web app's invite cookie (7 days). */
export const PENDING_INVITE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Stored = { code: string; savedAt: number };

/** The value to store for `rawCode`, or null when it can't be an invite code. */
export function serializePendingInvite(rawCode: string, now: number): string | null {
  const code = cleanInviteCode(rawCode);
  if (!code) return null;
  return JSON.stringify({ code, savedAt: now } satisfies Stored);
}

/** The stored code, or null when nothing is stored, it's unreadable, or it's older than 7 days. */
export function parsePendingInvite(raw: string | null | undefined, now: number): string | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { code, savedAt } = value as Partial<Stored>;
  if (typeof code !== 'string' || typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
  // A clock set back makes savedAt look like the future; treat that as fresh rather than lose the invite.
  if (now - savedAt > PENDING_INVITE_MAX_AGE_MS) return null;
  return cleanInviteCode(code);
}
