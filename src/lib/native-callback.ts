/**
 * Google blocks its sign-in page inside app web views, so the iOS/Android app opens it in an
 * in-app browser tab instead. Supabase then sends the user back to the app through this link
 * (registered in Info.plist and AndroidManifest.xml, and allow-listed in Supabase → Auth → URL
 * Configuration), and the app finishes sign-in at /auth/callback inside its own web view,
 * where the sign-in cookies live.
 */
export const NATIVE_CALLBACK = "app.lazychef://auth/callback"

/** `provider` "apple" lets /auth/callback keep Apple's refresh token for account deletion. */
export function nativeCallbackUrl(next: string, provider?: "apple") {
  return `${NATIVE_CALLBACK}?next=${encodeURIComponent(next)}${provider ? `&provider=${provider}` : ""}`
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

const HANDLED_LINKS_KEY = "lazychef:handled-app-links"
const MAX_HANDLED_LINKS = 20

type LinkStorage = Pick<Storage, "getItem" | "setItem">

/**
 * Remembers a sign-in link as handled for this app session. The app keeps reporting the same
 * launch link until it is restarted, so this stops it from being used again on later pages.
 * Returns true if the link is new, false if it was handled before, or null if storage isn't usable.
 */
export function markAppLinkHandled(link: string, getStorage: () => LinkStorage): boolean | null {
  try {
    const storage = getStorage()
    let handled: unknown
    try {
      handled = JSON.parse(storage.getItem(HANDLED_LINKS_KEY) ?? "[]")
    } catch {
      handled = []
    }
    const list = Array.isArray(handled) ? handled.filter((item): item is string => typeof item === "string") : []
    if (list.includes(link)) return false
    storage.setItem(HANDLED_LINKS_KEY, JSON.stringify([...list, link].slice(-MAX_HANDLED_LINKS)))
    return true
  } catch {
    return null
  }
}
