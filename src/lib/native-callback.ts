/**
 * Google blocks its sign-in page inside app web views, so the iOS/Android app opens it in an
 * in-app browser tab instead. Supabase then sends the user back to the app through this link
 * (registered in Info.plist and AndroidManifest.xml, and allow-listed in Supabase → Auth → URL
 * Configuration), and the app finishes sign-in at /auth/callback inside its own web view,
 * where the sign-in cookies live.
 */
export const NATIVE_CALLBACK = "app.lazychef://auth/callback"

export function nativeCallbackUrl(next: string) {
  return `${NATIVE_CALLBACK}?next=${encodeURIComponent(next)}`
}

/** "/auth/callback?…" for a link that opened the app, or null if it isn't a sign-in link. */
export function callbackPathFromAppLink(link: string) {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (`${url.protocol}//${url.host}${url.pathname}` !== NATIVE_CALLBACK) return null
  return `/auth/callback${url.search}`
}
