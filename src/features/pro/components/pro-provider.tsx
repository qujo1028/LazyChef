"use client"

import { useRouter } from "next/navigation"
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { callAction } from "@/lib/call-action"
import { getNativePlatform } from "@/lib/native/platform"

import { refreshPro } from "../actions"
import type { ProFeature } from "../plans"
import { presentRevenueCatPaywall, setupPurchases } from "../purchases"
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
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [feature, setFeature] = useState<ProFeature | null>(null)

  // In the app: sign in to RevenueCat early, so the paywall opens with prices ready.
  useEffect(() => {
    if (!getNativePlatform()) return
    setupPurchases(userId).catch((error) => console.error("RevenueCat setup failed:", error))
  }, [userId])

  const openPaywall = useCallback(
    (tapped?: ProFeature) => {
      // In the app: RevenueCat's own paywall (managed in the RevenueCat dashboard).
      if (getNativePlatform()) {
        void (async () => {
          try {
            const outcome = await presentRevenueCatPaywall(userId)
            if (outcome === "dismissed") return
            // Ask the server to read the new subscription so Pro unlocks right away.
            const result = await callAction(refreshPro)
            if ("error" in result) toast.success(outcome === "restored" ? "Pro restored" : "Welcome to Pro", { description: result.error })
            else toast.success(outcome === "restored" ? "Pro restored" : "Welcome to Pro")
            router.refresh()
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "The paywall couldn't open.")
          }
        })()
        return
      }
      // On the web: the info sheet (purchases only happen in the app).
      setFeature(tapped ?? null)
      setOpen(true)
    },
    [userId, router],
  )

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
