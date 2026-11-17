"use client"

import { useFormStatus } from "react-dom"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { signInWithApple, signInWithAppleIdToken } from "@/features/auth/actions"
import { randomNonce, sha256Hex } from "@/features/auth/apple"
import { actionError, callAction } from "@/lib/call-action"
import { isNativeApp } from "@/lib/native-app"
import { LazyChefAuth, hasNativeAuth, isCanceled } from "@/lib/native-auth"
import { openNativeOAuth } from "@/lib/native-oauth"

function AppleLogo() {
  return (
    <svg viewBox="0 0 384 512" className="size-5" fill="currentColor" aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="lg"
      // Apple's style: black in light mode, white in dark, at least as prominent as other providers.
      className="w-full bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85"
      disabled={pending}
    >
      <AppleLogo />
      {pending ? "Opening Apple…" : "Continue with Apple"}
    </Button>
  )
}

/**
 * The native Apple sheet in the iOS app, then a session in this web view. Returns "fallback" when the
 * sheet fails (e.g. a build without the Sign in with Apple entitlement), so Apple's web page is used.
 */
async function signInNatively(next: string): Promise<"fallback" | void> {
  const rawNonce = randomNonce()
  let result
  try {
    result = await LazyChefAuth.signInWithApple({ nonce: await sha256Hex(rawNonce) })
  } catch (error) {
    if (isCanceled(error)) return
    console.error(error)
    return "fallback"
  }

  const response = await callAction(() =>
    signInWithAppleIdToken({
      identityToken: result.identityToken,
      rawNonce,
      authorizationCode: result.authorizationCode,
      givenName: result.givenName,
      familyName: result.familyName,
      next,
    }),
  )
  const error = actionError(response)
  if (error) return void toast.error(error)
  if (response && "next" in response && response.next) window.location.assign(response.next)
}

/** Render only when isAppleSignInEnabled(). */
export function AppleButton({ next }: { next: string }) {
  return (
    <form
      action={async (formData) => {
        if (hasNativeAuth() && (await signInNatively(next)) !== "fallback") return

        // Everywhere else (website, Android, app builds without the plugin) Apple's web page
        // is used, exactly like Google; in the app it opens via openNativeOAuth.
        const native = isNativeApp()
        if (native) formData.set("native", "1")
        const result = await callAction(() => signInWithApple(formData))
        const error = actionError(result)
        if (error) return void toast.error(error)
        if (native && result && "url" in result && result.url) {
          try {
            await openNativeOAuth(result.url)
          } catch {
            toast.error("Apple sign-in didn't finish. Please try again.")
          }
        }
      }}
    >
      <input type="hidden" name="next" value={next} />
      <Submit />
    </form>
  )
}
