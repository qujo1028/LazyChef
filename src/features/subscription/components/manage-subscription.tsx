"use client"

import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useSubscription } from "./subscription-provider"

const PLAN_NAMES: Record<string, string> = { monthly: "Monthly", yearly: "Yearly" }

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
}

/**
 * The web stand-in for RevenueCat's Customer Center (which is mobile-only): plan, renewal, billing
 * problems, and a link to the Web Billing management page where people can cancel, change plan or
 * update their card.
 */
export function ManageSubscription() {
  const { pro, customerInfo, refresh } = useSubscription()
  const [refreshing, setRefreshing] = useState(false)
  if (!pro) return null

  const plan = PLAN_NAMES[pro.productIdentifier] ?? pro.productIdentifier
  const managementURL = customerInfo?.managementURL ?? null

  let renewal: string
  if (!pro.expirationDate) renewal = "Lifetime access."
  else if (pro.willRenew) renewal = `Renews on ${formatDate(pro.expirationDate)}.`
  else renewal = `Cancelled. Pro stays on until ${formatDate(pro.expirationDate)}.`

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your subscription</CardTitle>
        <CardDescription>
          {plan} plan{pro.isSandbox ? " (test)" : ""}. {renewal}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {pro.billingIssueDetectedAt ? (
          <div role="alert" className="flex gap-2 rounded-lg bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
            <p>We couldn&apos;t charge your card. Update your payment method to keep Pro.</p>
          </div>
        ) : null}

        {managementURL ? (
          <Button asChild>
            <a href={managementURL} target="_blank" rel="noopener noreferrer">
              Manage subscription
              <ExternalLink />
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Manage this subscription where you bought it.
          </p>
        )}

        <Button
          variant="outline"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true)
            await refresh()
            setRefreshing(false)
          }}
        >
          <RefreshCw className={refreshing ? "animate-spin" : undefined} />
          Refresh status
        </Button>
      </CardContent>
    </Card>
  )
}
