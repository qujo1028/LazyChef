"use client"

import { useEffect } from "react"

import { useStripParams } from "@/lib/use-strip-params"

import { usePro } from "./pro-provider"

/** Opens the paywall once when Household loads with ?pro=1 (the old /pro address redirects there). */
export function OpenPaywallOnArrival() {
  const { openPaywall } = usePro()
  useStripParams(["pro"])
  useEffect(() => {
    openPaywall()
    // Once, on arrival. openPaywall changes identity when the Pro status refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
