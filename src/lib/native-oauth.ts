import { hasNativeAuth, isCanceled, LazyChefAuth } from "@/lib/native-auth"
import { callbackPathFromAppLink } from "@/lib/native-callback"

const CALLBACK_SCHEME = "app.lazychef"
export const NATIVE_OAUTH_ERROR = "Sign-in didn't finish. Please try again."


/** The web path that finishes sign-in for a callback URL from the auth sheet; throws if it isn't one. */
export function callbackPathFromAuthSession(url: string) {
  const path = callbackPathFromAppLink(url)
  if (!path) throw new Error(NATIVE_OAUTH_ERROR)
  return path
}

/**
 * Opens a provider's OAuth URL from the app: "canceled" if the user closed the sheet, throws on failure.
 * On iOS builds with the LazyChef auth plugin this uses ASWebAuthenticationSession and loads
 * /auth/callback here; elsewhere it opens an in-app browser tab and the `app.lazychef://` link
 * brings the user back (see native-app-bridge.tsx).
 */
export async function openNativeOAuth(url: string): Promise<"opened" | "canceled"> {
  if (!hasNativeAuth()) {
    const { Browser } = await import("@capacitor/browser")
    await Browser.open({ url, presentationStyle: "popover" })
    return "opened"
  }

  let callbackUrl: string
  try {
    ;({ url: callbackUrl } = await LazyChefAuth.openAuthSession({ url, callbackScheme: CALLBACK_SCHEME }))
  } catch (error) {
    if (isCanceled(error)) return "canceled"
    throw new Error(NATIVE_OAUTH_ERROR)
  }
  window.location.assign(callbackPathFromAuthSession(callbackUrl))
  return "opened"
}
