import * as Linking from 'expo-linking';

import { supabase } from '../supabase';

import { buildCallbackUrl } from './callback-url';
import { createOnceRunner } from './once';

/**
 * The link Supabase sends people back to. `Linking.createURL` gives `app.lazychef://auth/callback`
 * in a build and `exp://<host>/--/auth/callback` in Expo Go. Both must be on the Supabase redirect
 * allow list (Auth, URL Configuration).
 */
export function authCallbackUrl(next: string, provider?: 'apple' | 'google'): string {
  return buildCallbackUrl(Linking.createURL('auth/callback'), next, provider);
}

/** Exchanges a PKCE code for a session, at most once per code. */
export const exchangeCodeOnce = createOnceRunner(async (code: string) => {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error ?? null;
});
