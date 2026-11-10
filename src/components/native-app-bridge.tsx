"use client"

import { useEffect } from "react"

import { isNativeApp } from "@/lib/native-app"
import { callbackPathFromAppLink } from "@/lib/native-callback"

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
      const handle = await App.addListener("appUrlOpen", ({ url }) => {
        const path = callbackPathFromAppLink(url)
        if (!path) return
        // Closing isn't supported everywhere (Android); the app is in front either way.
        void Browser.close().catch(() => {})
        window.location.assign(path)
      })
      if (removed) void handle.remove()
      else remove = () => void handle.remove()
    })()

    return () => {
      removed = true
      remove?.()
    }
  }, [])

  return null
}
