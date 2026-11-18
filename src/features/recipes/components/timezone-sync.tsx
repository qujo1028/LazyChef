"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { TIMEZONE_COOKIE } from "../filters"

/**
 * The server can't see the phone's clock, so this saves the phone's time zone in a cookie and
 * refreshes the page once so the Auto meal (breakfast, lunch, dinner...) matches the time where
 * the viewer is. Later visits already have the cookie, so there's no refresh; it only refreshes
 * again if the zone changes (travel).
 */
export function TimezoneSync({ current }: { current: string | null }) {
  const router = useRouter()

  useEffect(() => {
    let zone: string | undefined
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return
    }
    if (!zone || zone === current) return
    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }, [current, router])

  return null
}
