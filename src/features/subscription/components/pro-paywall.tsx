"use client"

import { Loader2, RefreshCw } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useSubscription } from "./subscription-provider"

type PaywallState =
  | { kind: "loading" }
  | { kind: "showing" }
  | { kind: "closed" }
  | { kind: "no-offering" }
  | { kind: "error"; message: string }

/**
 * Renders the RevenueCat Paywall for the current offering inline. The paywall's design and plans
 * (monthly / yearly) come from the RevenueCat dashboard, so changing them needs no deploy.
 */
export function ProPaywall({ customerEmail }: { customerEmail?: string }) {
  const { appUserId, setCustomerInfo } = useSubscription()
  const targetRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PaywallState>({ kind: "loading" })
  const [attempt, setAttempt] = useState(0)
  // presentPaywall mounts UI into the target; guard against React Strict Mode running the effect twice.
  const presented = useRef(-1)

  useEffect(() => {
    if (presented.current === attempt || !targetRef.current) return
    presented.current = attempt
    const target = targetRef.current
    let active = true

    void (async () => {
      const rc = await import("../revenuecat")
      try {
        const purchases = await rc.getPurchases(appUserId)
        const offerings = await purchases.getOfferings()
        const offering = offerings.current
        if (!offering) {
          if (active) setState({ kind: "no-offering" })
          return
        }
        if (active) setState({ kind: "showing" })
        const result = await purchases.presentPaywall({ htmlTarget: target, offering, customerEmail })
        setCustomerInfo(result.customerInfo)
        if (rc.proEntitlement(result.customerInfo)) toast.success("Welcome to LazyChef Pro!")
        else toast("Purchase complete. Pro will unlock in a moment.")
      } catch (e) {
        if (!active) return
        if (rc.isUserCancelled(e)) setState({ kind: "closed" })
        else setState({ kind: "error", message: rc.describeError(e) })
      } finally {
        target.replaceChildren()
      }
    })()

    return () => {
      active = false
    }
  }, [attempt, appUserId, customerEmail, setCustomerInfo])

  const retry = () => {
    setState({ kind: "loading" })
    setAttempt((n) => n + 1)
  }

  return (
    <div className="grid gap-4">
      {state.kind === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading plans…
        </div>
      ) : null}

      {state.kind === "closed" ? (
        <div className="grid gap-3 rounded-xl border p-4 text-sm">
          <p>No problem. You can upgrade any time.</p>
          <Button onClick={retry}>See plans</Button>
        </div>
      ) : null}

      {state.kind === "no-offering" ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          Plans aren&apos;t available yet. Check back soon.
        </p>
      ) : null}

      {state.kind === "error" ? (
        <div role="alert" className="grid gap-3 rounded-xl border border-destructive/40 p-4 text-sm">
          <p>{state.message}</p>
          <Button variant="outline" onClick={retry}>
            <RefreshCw />
            Try again
          </Button>
        </div>
      ) : null}

      <div ref={targetRef} className={state.kind === "showing" ? "min-h-[28rem] overflow-hidden rounded-xl" : "hidden"} />
    </div>
  )
}
