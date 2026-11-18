"use client"

import { BadgeCheck, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ManageSubscription } from "./manage-subscription"
import { ProPaywall } from "./pro-paywall"
import { useSubscription } from "./subscription-provider"

export function ProView({ customerEmail }: { customerEmail?: string }) {
  const { status, error, isPro, refresh } = useSubscription()

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Checking your subscription…
      </div>
    )
  }

  if (status === "disabled") {
    return <p className="rounded-xl border p-4 text-sm text-muted-foreground">Subscriptions aren&apos;t available yet.</p>
  }

  if (status === "error") {
    return (
      <div role="alert" className="grid gap-3 rounded-xl border border-destructive/40 p-4 text-sm">
        <p>{error}</p>
        <Button variant="outline" onClick={() => void refresh()}>
          <RefreshCw />
          Try again
        </Button>
      </div>
    )
  }

  if (isPro) {
    return (
      <>
        <div className="flex gap-3 rounded-xl bg-primary/10 p-4 text-sm">
          <BadgeCheck className="size-5 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-medium">You have LazyChef Pro.</span> Thanks for supporting the app!
          </p>
        </div>
        <ManageSubscription />
      </>
    )
  }

  return <ProPaywall customerEmail={customerEmail} />
}

/** Compact status line for other pages (e.g. Household): "Pro" or "Free". */
export function ProStatusLabel() {
  const { status, isPro } = useSubscription()
  if (status === "loading") return <span className="text-muted-foreground">…</span>
  if (status !== "ready") return null
  return <span className={isPro ? "font-medium text-primary" : "text-muted-foreground"}>{isPro ? "Pro" : "Free"}</span>
}
