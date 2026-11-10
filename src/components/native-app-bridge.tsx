"use client"

import { useEffect } from "react"

import { isNativeApp } from "@/lib/native-app"
import { callbackPathFromAppLink, markAppLinkHandled } from "@/lib/native-callback"

// Links handled by this page, in case session storage isn't usable.
const handledHere = new Set<string>()

/**
 * App-only glue; renders nothing and does nothing in a browser. When Google sign-in comes back
 * through the app link, close the in-app browser tab and finish signing in here, in the app's
 * web view, which holds the sign-in cookies.
 */
export function NativeAppBridge() {
  useEffect(() => {
    if (!isNativeApp()) return
    let removed = false
    let remove: (() => void) | undefined

    void (async () => {
      const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")])

      const openLink = (url: string, isLaunchUrl: boolean) => {
        const path = callbackPathFromAppLink(url)
        if (!path || handledHere.has(url)) return
        const isNew = markAppLinkHandled(url, () => window.sessionStorage)
        if (isNew === false) return
        // The launch link never goes away, so without storage we can't tell if it's stale.
        if (isNew === null && isLaunchUrl) return
        handledHere.add(url)
        // Closing isn't supported everywhere (Android); the app is in front either way.
        void Browser.close().catch(() => {})
        window.location.assign(path)
      }

      const handle = await App.addListener("appUrlOpen", ({ url }) => openLink(url, false))
      if (removed) {
        void handle.remove()
        return
      }
      remove = () => void handle.remove()

      // If the app was closed while the sign-in tab was open, the link relaunched it before
      // this listener existed.
      const launch = await App.getLaunchUrl().catch(() => undefined)
      if (!removed && launch?.url) openLink(launch.url, true)
    })()

    return () => {
      removed = true
      remove?.()
    }
  }, [])

  return null
}
