// Pure helpers for the app's sign-in links. Needs a WHATWG URL: the root layout loads
// react-native-url-polyfill/auto first.

/** The `auth/callback` link for this build, with `next` and an optional provider tag. */
export function buildCallbackUrl(base: string, next: string, provider?: 'apple' | 'google'): string {
  const query = `next=${encodeURIComponent(next)}${provider ? `&provider=${provider}` : ''}`;
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

export type CallbackParams = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  next: string | null;
};

function first(value: string | string[] | undefined | null): string | null {
  const one = Array.isArray(value) ? value[0] : value;
  return typeof one === 'string' && one.length > 0 ? one : null;
}

/** From expo-router's search params. */
export function callbackParamsFromSearch(search: Record<string, string | string[] | undefined>): CallbackParams {
  return {
    code: first(search.code),
    error: first(search.error_code) ?? first(search.error),
    errorDescription: first(search.error_description),
    next: first(search.next),
  };
}

/**
 * From a full link, such as the one the in-app browser hands back after Google. Supabase can put
 * the values in the query (PKCE) or the fragment (errors), so both are read.
 */
export function callbackParamsFromUrl(link: string): CallbackParams | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const merged: Record<string, string> = {};
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  for (const source of [new URLSearchParams(hash), url.searchParams]) {
    source.forEach((value, key) => {
      merged[key] = value;
    });
  }
  return callbackParamsFromSearch(merged);
}
