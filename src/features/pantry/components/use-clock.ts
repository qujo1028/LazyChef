"use client"

import { useSyncExternalStore } from "react"

import { localDateKey } from "../dates"

// The server doesn't know the viewer's time zone, so the server render and hydration
// use the server's day and clock; the browser switches to its own right after. Both
// re-read every minute and when the app comes back to the foreground (a phone left
// overnight should show today's expiry labels).
const MINUTE_MS = 60_000

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, MINUTE_MS)
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange()
  }
  document.addEventListener("visibilitychange", onVisible)
  return () => {
    window.clearInterval(id)
    document.removeEventListener("visibilitychange", onVisible)
  }
}

function readToday() {
  return localDateKey()
}

function readNow() {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS
}

/** Today as YYYY-MM-DD in the viewer's time zone. */
export function useToday(serverToday: string): string {
  return useSyncExternalStore(subscribe, readToday, () => serverToday)
}

/** The time (ms), to the minute, for "2d ago" labels. */
export function useNow(serverNow: number): number {
  return useSyncExternalStore(subscribe, readNow, () => serverNow)
}
