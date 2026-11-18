"use client"

import { Crown, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useNativePlatform } from "@/lib/native/platform"
import { useViewerTime } from "@/lib/use-viewer-time"

import { presentCustomerCenter } from "../purchases"
import { proStatusLine } from "@lazychef/core/pro/status-line"
import { usePro } from "./pro-provider"

/** "LazyChef Pro" on the Household page: what plan you're on, and the way to Pro or to manage it. */
export function ProCard() {
  const { status, userId, isPro, openPaywall } = usePro()
  const platform = useNativePlatform()
  const { timeZone } = useViewerTime(status.checkedAt)

  return (
    <Card className={isPro ? "border-primary/40 bg-primary/5" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="size-5 text-primary" aria-hidden />
          LazyChef Pro
          {isPro ? <Badge>Pro</Badge> : <Badge variant="secondary">Free</Badge>}
        </CardTitle>
        <CardDescription>{proStatusLine(status, timeZone)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {!isPro ? (
          <Button type="button" onClick={() => openPaywall()}>
            See what Pro includes
          </Button>
        ) : null}
        {platform && status.mePro && status.meSource === "subscription" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => presentCustomerCenter(userId).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't open subscription settings."))}
          >
            Manage subscription
          </Button>
        ) : status.mePro && status.meSource === "subscription" && status.managementUrl ? (
          <Button asChild variant="outline">
            <a href={status.managementUrl} target="_blank" rel="noreferrer">
              Manage subscription
              <ExternalLink aria-hidden />
            </a>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
