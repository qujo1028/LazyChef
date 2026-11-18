import * as WebBrowser from 'expo-web-browser';

import { supabase } from '../supabase';

import { callbackParamsFromUrl } from './callback-url';
import { friendlyAuthError, friendlyCallbackError, GENERIC_AUTH_ERROR } from './errors';
import { authCallbackUrl, exchangeCodeOnce } from './redirect';

export type SocialResult = { status: 'done' } | { status: 'cancelled' } | { status: 'error'; message: string };

/** Google in an in-app browser tab (Google blocks embedded web views), then a PKCE exchange. */
export async function signInWithGoogle(): Promise<SocialResult> {
  try {
    const redirectTo = authCallbackUrl('/', 'google');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) return { status: 'error', message: friendlyAuthError(error) };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // Closing the tab or backing out is not an error.
    if (result.type !== 'success') return { status: 'cancelled' };

    const params = callbackParamsFromUrl(result.url);
    if (params?.error) {
      const message = friendlyCallbackError(params.error, params.errorDescription);
      return /cancelled/.test(message) ? { status: 'cancelled' } : { status: 'error', message };
    }
    if (!params?.code) return { status: 'error', message: GENERIC_AUTH_ERROR };

    const exchangeError = await exchangeCodeOnce(params.code);
    return exchangeError ? { status: 'error', message: friendlyAuthError(exchangeError) } : { status: 'done' };
  } catch (error) {
    return { status: 'error', message: friendlyAuthError(error) };
  }
}
