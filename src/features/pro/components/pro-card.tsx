"use client"

import { Crown, ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useViewerTime } from "@/lib/use-viewer-time"

import { proStatusLine } from "../status-line"
import { usePro } from "./pro-provider"

/** "LazyChef Pro" on the Household page: what plan you're on, and the way to Pro or to manage it. */
export function ProCard() {
  const { status, isPro, openPaywall } = usePro()
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
        {status.mePro && status.meSource === "subscription" && status.managementUrl ? (
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
