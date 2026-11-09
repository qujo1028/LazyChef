"use client"

import { Capacitor } from "@capacitor/core"
import { useSyncExternalStore } from "react"

export type NativePlatform = "ios" | "android"

/**
 * "ios" or "android" inside the LazyChef app (the Capacitor shell injects its bridge into the
 * page), null in a browser or on the server.
 */
export function getNativePlatform(): NativePlatform | null {
  if (typeof window === "undefined") return null
  const platform = Capacitor.getPlatform()
  return platform === "ios" || platform === "android" ? platform : null
}

const noop = () => () => {}

/** getNativePlatform() for components: null on the server and the first render, then the real value. */
export function useNativePlatform(): NativePlatform | null {
  return useSyncExternalStore(noop, getNativePlatform, () => null)
}
