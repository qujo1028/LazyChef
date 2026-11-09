"use client"

import { createContext, use, useCallback, useEffect, useMemo, useState } from "react"

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { getNativePlatform } from "@/lib/native/platform"

import type { ProFeature } from "../plans"
import { setupPurchases } from "../purchases"
import type { ProStatus } from "../status"
import { Paywall } from "./paywall"

type ProContextValue = {
  status: ProStatus
  userId: string
  /** Pro features are on for this household. */
  isPro: boolean
  /** Opens the paywall, headed by the feature that was tapped. */
  openPaywall: (feature?: ProFeature) => void
}

const ProContext = createContext<ProContextValue | null>(null)

/** Pro status for every tab, and the paywall sheet that any Pro feature can open. */
export function ProProvider({ status, userId, children }: { status: ProStatus; userId: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [feature, setFeature] = useState<ProFeature | null>(null)

  // In the app: sign in to RevenueCat early, so the paywall opens with prices ready.
  useEffect(() => {
    if (!getNativePlatform()) return
    setupPurchases(userId).catch((error) => console.error("RevenueCat setup failed:", error))
  }, [userId])

  const openPaywall = useCallback((tapped?: ProFeature) => {
    setFeature(tapped ?? null)
    setOpen(true)
  }, [])

  const value = useMemo(
    () => ({ status, userId, isPro: status.householdPro, openPaywall }),
    [status, userId, openPaywall],
  )

  return (
    <ProContext value={value}>
      {children}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="mx-auto w-full max-w-lg data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
          <DrawerTitle className="sr-only">LazyChef Pro</DrawerTitle>
          <div className="overflow-y-auto px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Paywall
              status={status}
              userId={userId}
              feature={feature}
              onDone={() => setOpen(false)}
              onMaybeLater={() => setOpen(false)}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </ProContext>
  )
}

export function usePro(): ProContextValue {
  const value = use(ProContext)
  if (!value) throw new Error("usePro() needs a <ProProvider> above it.")
  return value
}
