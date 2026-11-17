"use client"

import { useEffect } from "react"

import { inAppBrowserUrl } from "@/lib/external-link"
import { isNativeApp } from "@/lib/native-app"

/** In the app, links to other websites open in an in-app browser sheet instead of leaving LazyChef. */
export function NativeExternalLinks() {
  useEffect(() => {
    if (!isNativeApp()) return

    function onClick(event: MouseEvent) {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null
      if (!anchor) return
      const url = inAppBrowserUrl(anchor.getAttribute("href"), document.baseURI, event, anchor.hasAttribute("download"))
      if (!url) return
      event.preventDefault()
      void import("@capacitor/browser").then(({ Browser }) => Browser.open({ url }))
    }

    // Capture phase, so this runs before Next's <Link> or the WebView handle the tap.
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])

  return null
}
