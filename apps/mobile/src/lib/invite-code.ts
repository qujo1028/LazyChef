// Pure helpers for invite codes and the errors that come back from the household RPCs.
// No React Native imports, so Vitest can run the tests.
import { formatInviteCode, normalizeInviteCode } from '@lazychef/core/household/invite';

/** Postgres error code the database raises after too many wrong invite codes (see src/lib/rate-limit.ts). */
export const RATE_LIMITED_CODE = 'LZ429';

export const INVITE_CODE_LENGTH = 8;

/** "k7qx - m2pa" → "K7QXM2PA", or null when it can't be a code (wrong length). */
export function cleanInviteCode(raw: string | null | undefined): string | null {
  const code = normalizeInviteCode(raw ?? '');
  return code.length === INVITE_CODE_LENGTH ? code : null;
}

/** What the code field shows while typing: "k7qxm" → "K7QX-M", capped at 8 characters. */
export function formatCodeInput(value: string): string {
  const clean = normalizeInviteCode(value).slice(0, INVITE_CODE_LENGTH);
  return clean.length > 4 ? formatInviteCode(clean) : clean;
}

export const MESSAGES = {
  badCode: 'Invite codes have 8 letters and numbers, like K7QX-M2PA.',
  noMatch: "That invite code doesn't match any household.",
  limited: 'Too many tries, wait about 15 minutes.',
  offline: "Couldn't reach LazyChef. Check your connection and try again.",
  generic: 'Something went wrong. Try again.',
} as const;

/** The parts of a PostgrestError (or a thrown fetch error) we look at. */
export type RpcError = { code?: string | null; message?: string | null; name?: string | null };

const NETWORK_RE = /network request failed|failed to fetch|fetch failed|network ?error|timed? ?out|aborted|load failed|offline/i;

export function isRateLimited(error: RpcError | null | undefined): boolean {
  return error?.code === RATE_LIMITED_CODE;
}

export function isNetworkError(error: RpcError | null | undefined): boolean {
  if (!error) return false;
  // postgrest-js turns a failed fetch into { code: '', message: 'TypeError: Network request failed' }.
  if (error.code && error.code !== '') return false;
  return NETWORK_RE.test(`${error.name ?? ''} ${error.message ?? ''}`);
}

/**
 * A plain message for a failed household call. Validation errors raised by our own SQL
 * (errcode 22023, like "Household names need 1 to 60 characters.") are already written for people.
 */
export function householdErrorMessage(error: RpcError | null | undefined): string {
  if (isRateLimited(error)) return MESSAGES.limited;
  if (isNetworkError(error)) return MESSAGES.offline;
  if (error?.code === '22023' && error.message) return error.message;
  return MESSAGES.generic;
}

/** "1 person is" / "3 people are" already sharing a pantry there. */
export function memberCountLine(count: number, verb: 'is' | 'shares' = 'is'): string {
  const n = Math.max(0, Math.trunc(count));
  if (verb === 'shares') return `${n} ${n === 1 ? 'person shares' : 'people share'} this pantry and shopping list.`;
  return `${n} ${n === 1 ? 'person is' : 'people are'} already sharing a pantry there.`;
}

/** "Quinn Johnson" → "Quinn". Empty or blank names give null. */
export function firstName(displayName: string | null | undefined): string | null {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first ? first : null;
}
