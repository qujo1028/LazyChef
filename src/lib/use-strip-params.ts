"use client"

import { useEffect } from "react"

/**
 * One-shot URL flags (?add=bulk, ?new=1, ?edit=1, ?pro=1) are read on the server to open a
 * sheet. Once the page has them, drop them from the address bar so a refresh or a shared
 * link doesn't reopen the sheet. Next syncs history.replaceState with its router.
 */
export function useStripParams(names: readonly string[]) {
  const key = names.join(",")
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const present = key.split(",").filter((name) => url.searchParams.has(name))
      if (present.length === 0) return
      for (const name of present) url.searchParams.delete(name)
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    } catch {
      // The flags just stay in the address bar.
    }
  }, [key])
}
