"use client"

import { Capacitor } from "@capacitor/core"

import { callAction } from "@/lib/call-action"
import { registerForPush, unregister } from "@/lib/native/push"
import { getNativePlatform } from "@/lib/native/platform"

import { registerDeviceToken, removeDeviceToken } from "./actions"

const TOKEN_KEY = "lazychef.pushToken"

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage can be unavailable; the server cleans dead tokens up on its own.
  }
}

/** Saves a fresh token with this phone's time zone. Quiet on failure: the next app open retries. */
async function saveToken(token: string) {
  const platform = getNativePlatform()
  if (!platform) return
  writeToken(token)
  let appVersion: string | null = null
  try {
    appVersion = (await (await import("@capacitor/app")).App.getInfo()).version.slice(0, 40)
  } catch {
    // The version is only for debugging.
  }
  const result = await callAction(() =>
    registerDeviceToken({
      token,
      platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      appVersion,
    }),
  )
  if ("error" in result && result.error) console.error(result.error)
}

/** Gets the token (permission must be granted) and saves it. Run on every app open. */
export function registerThisDevice(onError?: (message: string) => void) {
  return registerForPush((token) => void saveToken(token), onError)
}

/** Before signing out or turning pushes off: stop this phone getting this account's pushes. */
export async function forgetThisDevice() {
  if (!Capacitor.isNativePlatform()) return
  const token = readToken()
  if (token) await callAction(() => removeDeviceToken(token))
  writeToken(null)
  await unregister()
}

export { saveToken }
