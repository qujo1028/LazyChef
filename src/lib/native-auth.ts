import { Capacitor, registerPlugin } from "@capacitor/core"

/** What the native Sign in with Apple sheet returns. Name and email only come on the first sign-in. */
export type AppleSignInResult = {
  identityToken: string
  authorizationCode: string | null
  givenName: string | null
  familyName: string | null
  email: string | null
}

/** The app-local iOS plugin in ios/App/App/LazyChefAuthPlugin.swift. */
export interface LazyChefAuthPlugin {
  /** `nonce` must already be SHA-256 hashed; give Supabase the raw one. */
  signInWithApple(options: { nonce: string }): Promise<AppleSignInResult>
  /** Opens `url` in an ASWebAuthenticationSession and resolves with the `callbackScheme://` URL. */
  openAuthSession(options: { url: string; callbackScheme: string }): Promise<{ url: string }>
}

export const LazyChefAuth = registerPlugin<LazyChefAuthPlugin>("LazyChefAuth")

/**
 * True only in the iOS app when this build includes the plugin. The app loads the live site, so
 * older builds without the plugin run this code too.
 */
export function hasNativeAuth(): boolean {
  return Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("LazyChefAuth")
}

/** True when the plugin rejected because the user dismissed the sign-in sheet. */
export function isCanceled(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "CANCELED"
}
