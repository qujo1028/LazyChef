// Calls the web app's server routes (packages/core/src/push/app-contract.ts) with the signed-in
// person's Supabase access token. Used for work the phone can't do itself: account deletion
// and pushes to housemates. Never throws: every problem comes back as an AppApiFailure.
import { onlineManager } from '@tanstack/react-query';
import type { AppApiErrorCode, AppApiFailure } from '@lazychef/core/push/app-contract';

import { supabase } from '@/lib/supabase';

const DEFAULT_ORIGIN = 'https://lazychef-gamma.vercel.app';
const TIMEOUT_MS = 15_000;

/** The web origin, without a trailing slash. */
export function webOrigin(): string {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  return (value || DEFAULT_ORIGIN).replace(/\/+$/, '');
}

const failure = (code: AppApiErrorCode, error: string): AppApiFailure => ({ ok: false, code, error });

const CODES: readonly AppApiErrorCode[] = [
  'unauthorized',
  'forbidden',
  'bad_request',
  'not_configured',
  'rate_limited',
  'failed',
  'offline',
];

/** POSTs JSON to `path` (an APP_API value) and returns the route's JSON, or a failure. */
export async function callWebApi<T extends { ok: true }>(path: string, body: unknown): Promise<T | AppApiFailure> {
  if (!onlineManager.isOnline()) return failure('offline', "You're offline. Try again when you're connected.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return failure('unauthorized', 'Sign in again to do that.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${webOrigin()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      // Not JSON (a proxy page, an HTML error): handled below.
    }
    if (response.ok && json && typeof json === 'object' && (json as { ok?: unknown }).ok === true) return json as T;
    const parsed = json as Partial<AppApiFailure> | null;
    if (parsed && typeof parsed.error === 'string' && CODES.includes(parsed.code as AppApiErrorCode)) {
      return failure(parsed.code as AppApiErrorCode, parsed.error);
    }
    if (response.status === 401) return failure('unauthorized', 'Sign in again to do that.');
    return failure('failed', 'Something went wrong. Try again in a minute.');
  } catch {
    return failure('offline', "Couldn't reach LazyChef. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}
