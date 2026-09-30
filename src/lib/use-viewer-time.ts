"use client"

import { useSyncExternalStore } from "react"

const TICK_MS = 60_000

function subscribeClock(onTick: () => void) {
  const id = window.setInterval(onTick, TICK_MS)
  return () => window.clearInterval(id)
}

function readClock() {
  return Math.floor(Date.now() / TICK_MS) * TICK_MS
}

function subscribeNever() {
  return () => {}
}

/**
 * The time and time zone to show dates in: the server's `serverNow` in UTC on the first
 * render (so it hydrates without a mismatch), then the viewer's clock and zone.
 */
export function useViewerTime(serverNow: number): { now: number; timeZone: string | undefined } {
  const now = useSyncExternalStore(subscribeClock, readClock, () => serverNow)
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false)
  return { now, timeZone: hydrated ? undefined : "UTC" }
}
