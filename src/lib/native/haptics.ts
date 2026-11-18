// Haptic feedback: the Capacitor plugin inside the app, navigator.vibrate in browsers that have it.
// The decision logic is in fireHaptic() with injected dependencies so it can be tested without a device.
import type { HapticKind } from "@lazychef/core/haptics/kinds"

import { getNativePlatform } from "./platform"

export type { HapticKind }

/** Vibration patterns (ms) for browsers. iOS Safari has no vibrate(); that is expected. */
export const WEB_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 10,
  light: 15,
  rise: 28,
  success: [20, 40, 30],
  milestone: [40, 50, 60],
}

export type HapticDeps = {
  /** True on the server: nothing to do. */
  server: boolean
  enabled: boolean
  /** Plays the kind with the native plugin, or null in a browser. */
  native: ((kind: HapticKind) => void) | null
  /** navigator.vibrate bound to the navigator, or null when missing. */
  vibrate: ((pattern: number | number[]) => unknown) | null
}

export type HapticOutcome = "native" | "web" | "skipped"

/** Pure routing: gating first (server, setting), then native, then vibrate. */
export function fireHaptic(kind: HapticKind, deps: HapticDeps): HapticOutcome {
  if (deps.server || !deps.enabled) return "skipped"
  if (deps.native) {
    try {
      deps.native(kind)
      return "native"
    } catch {
      return "skipped"
    }
  }
  if (deps.vibrate) {
    try {
      deps.vibrate(WEB_PATTERNS[kind])
      return "web"
    } catch {
      return "skipped"
    }
  }
  return "skipped"
}

const STORAGE_KEY = "lazychef:haptics"
const CHANGE_EVENT = "lazychef:haptics-change"

/** The on/off switch. On by default, and on whenever storage is unavailable. */
export function getHapticsEnabled(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off"
  } catch {
    return true
  }
}

export function setHapticsEnabled(on: boolean) {
  if (typeof window === "undefined") return
  try {
    if (on) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, "off")
  } catch {
    // Storage is blocked: nothing to persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** For useSyncExternalStore. */
export function subscribeHapticsEnabled(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

type HapticsModule = typeof import("@capacitor/haptics")
let pluginPromise: Promise<HapticsModule> | null = null

function playNative(kind: HapticKind) {
  pluginPromise ??= import("@capacitor/haptics")
  void pluginPromise
    .then(({ Haptics, ImpactStyle, NotificationType }) => {
      switch (kind) {
        case "tap":
        case "light":
          return Haptics.impact({ style: ImpactStyle.Light })
        case "rise":
          return Haptics.impact({ style: ImpactStyle.Medium })
        case "success":
          return Haptics.notification({ type: NotificationType.Success })
        case "milestone":
          return Haptics.impact({ style: ImpactStyle.Heavy })
      }
    })
    .catch(() => {
      // The plugin is missing from this build of the shell (needs `npx cap sync`): do nothing.
    })
}

/**
 * Plays a haptic. Safe anywhere: no-ops on the server or when switched off. Reduced motion does not
 * gate it (taps are functional feedback); only the decorative reward timeline drops haptics for it.
 */
export function haptic(kind: HapticKind): HapticOutcome {
  const server = typeof window === "undefined"
  return fireHaptic(kind, {
    server,
    enabled: getHapticsEnabled(),
    native: !server && getNativePlatform() ? playNative : null,
    vibrate:
      !server && typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
        ? (pattern) => navigator.vibrate(pattern)
        : null,
  })
}
