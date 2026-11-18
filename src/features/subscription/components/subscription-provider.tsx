"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

import type { CustomerInfo, EntitlementInfo } from "../revenuecat"

type Status = "loading" | "ready" | "error" | "disabled"

type SubscriptionContextValue = {
  status: Status
  error: string | null
  customerInfo: CustomerInfo | null
  /** The active `lazychef_pro` entitlement, or null. */
  pro: EntitlementInfo | null
  isPro: boolean
  appUserId: string
  /** Re-fetch customer info (e.g. after returning from the management page). */
  refresh: () => Promise<void>
  /** Store customer info returned by a purchase, so the UI updates without another request. */
  setCustomerInfo: (info: CustomerInfo) => void
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

const loadRevenueCat = () => import("../revenuecat")

export function SubscriptionProvider({ appUserId, children }: { appUserId: string; children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading")
  const [error, setError] = useState<string | null>(null)
  const [customerInfo, setInfo] = useState<CustomerInfo | null>(null)
  const [pro, setPro] = useState<EntitlementInfo | null>(null)
  const requestId = useRef(0)

  const apply = useCallback(async (info: CustomerInfo) => {
    const rc = await loadRevenueCat()
    setInfo(info)
    setPro(rc.proEntitlement(info))
    setError(null)
    setStatus("ready")
  }, [])

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    const rc = await loadRevenueCat()
    if (!rc.getApiKey()) {
      setStatus("disabled")
      return
    }
    try {
      const purchases = await rc.getPurchases(appUserId)
      const info = await purchases.getCustomerInfo()
      if (id === requestId.current) await apply(info)
    } catch (e) {
      if (id !== requestId.current) return
      setError(rc.describeError(e))
      setStatus("error")
    }
  }, [appUserId, apply])

  useEffect(() => {
    // Initial load and user switches; the SDK caches customer info, so this is cheap.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with an external SDK
    void refresh()
  }, [refresh])

  useEffect(() => {
    // Coming back from the Web Billing management page (another tab) may have changed the plan.
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [refresh])

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      status,
      error,
      customerInfo,
      pro,
      isPro: pro !== null,
      appUserId,
      refresh,
      setCustomerInfo: (info) => void apply(info),
    }),
    [status, error, customerInfo, pro, appUserId, refresh, apply],
  )

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
}

export function useSubscription(): SubscriptionContextValue {
  const value = useContext(SubscriptionContext)
  if (!value) throw new Error("useSubscription must be used inside <SubscriptionProvider>")
  return value
}

/** Convenience hook for gating features: `const { isPro, loading } = useIsPro()`. */
export function useIsPro() {
  const { isPro, status } = useSubscription()
  return { isPro, loading: status === "loading" }
}
