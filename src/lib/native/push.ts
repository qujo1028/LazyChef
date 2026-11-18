"use client"

import { Capacitor, type PluginListenerHandle } from "@capacitor/core"

import { isNativeApp } from "@/lib/native-app"

export type PushPermission = "granted" | "denied" | "prompt" | "unsupported"

/**
 * Where a tapped push may send the app. Payloads are untrusted, so only same-site paths pass:
 * must start with a single "/", no "//", no backslashes or control characters.
 */
export function safePushPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null
  if (!value.startsWith("/") || value.startsWith("//")) return null
  if (/[\\\u0000-\u001F\u007F]/.test(value)) return null
  try {
    if (new URL(value, "http://safe-path.invalid").origin !== "http://safe-path.invalid") return null
  } catch {
    return null
  }
  return value
}

/** True inside the iOS/Android app when this build has the push plugin. */
export function isPushSupported(): boolean {
  return isNativeApp() && Capacitor.isPluginAvailable("PushNotifications")
}

async function plugin() {
  return (await import("@capacitor/push-notifications")).PushNotifications
}

function toPermission(receive: string): PushPermission {
  return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt"
}

export async function pushPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return "unsupported"
  try {
    return toPermission((await (await plugin()).checkPermissions()).receive)
  } catch {
    return "unsupported"
  }
}

let registrationHandles: PluginListenerHandle[] = []

/**
 * Asks the phone for a push token (permission must already be granted) and hands each token to
 * `onToken`. Safe to call again: listeners are replaced, not stacked.
 */
export async function registerForPush(onToken: (token: string) => void, onError?: (message: string) => void): Promise<void> {
  if (!isPushSupported()) return
  const push = await plugin()
  await Promise.all(registrationHandles.map((handle) => handle.remove()))
  registrationHandles = await Promise.all([
    push.addListener("registration", ({ value }) => onToken(value)),
    push.addListener("registrationError", (error) => onError?.(error.error)),
  ])
  await push.register()
}

/** The in-context permission request, then registers. Call it from a button the user pressed. */
export async function requestAndRegister(onToken: (token: string) => void, onError?: (message: string) => void): Promise<PushPermission> {
  if (!isPushSupported()) return "unsupported"
  const push = await plugin()
  const permission = toPermission((await push.requestPermissions()).receive)
  if (permission === "granted") await registerForPush(onToken, onError)
  return permission
}

/** Stops this phone from receiving pushes. The caller removes the token from the server. */
export async function unregister(): Promise<void> {
  if (!isPushSupported()) return
  try {
    const push = await plugin()
    await Promise.all(registrationHandles.map((handle) => handle.remove()))
    registrationHandles = []
    await push.unregister()
  } catch {
    // Nothing useful to do; the server forgets the token either way.
  }
}

/** Calls `navigate` with the path from a tapped push. Returns a function that stops listening. */
export function listenForPushTaps(navigate: (path: string) => void): () => void {
  if (!isPushSupported()) return () => {}
  let removed = false
  let handle: PluginListenerHandle | undefined
  void plugin().then(async (push) => {
    const added = await push.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const path = safePushPath((notification.data as { url?: unknown } | undefined)?.url)
      if (path) navigate(path)
    })
    if (removed) void added.remove()
    else handle = added
  })
  return () => {
    removed = true
    void handle?.remove()
  }
}
