"use client"

import { useRef } from "react"

import { showBanner } from "@/components/ui/sonner"
import { useHouseholdChanges } from "@/features/household/components/household-channel"

import { createBannerGate, housemateCookMessage, type BannerMember } from "@lazychef/core/habit/banner"

/** Renders nothing. Drops a banner from the top when a housemate cooks (see banner.ts for the rules). */
export function HousemateCookBanner({ viewerId, members }: { viewerId: string; members: BannerMember[] }) {
  const gate = useRef(createBannerGate())

  useHouseholdChanges("activity_log", (change) => {
    if (change.operation !== "INSERT" || !change.record) return
    const message = housemateCookMessage(change.record, viewerId, members)
    if (!message || !gate.current.shouldShow(message.batchId, Date.now())) return
    showBanner({ title: message.title, tone: "cook" })
  })

  return null
}
