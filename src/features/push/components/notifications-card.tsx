"use client"

import { BellRing, Loader2 } from "lucide-react"
import { useEffect, useId, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { actionError, callAction } from "@/lib/call-action"
import { useNativePlatform } from "@/lib/native/platform"
import { pushPermission, requestAndRegister, type PushPermission } from "@/lib/native/push"

import { saveNotificationPrefs } from "../actions"
import { forgetThisDevice, saveToken } from "../device"
import { markAsked } from "../offer"
import { PREF_LABELS, type NotificationPrefs } from "@lazychef/core/push/prefs"

/** "Notifications" card on Household. Only in the iOS/Android app; the website has no push. */
export function NotificationsCard({ initial }: { initial: NotificationPrefs }) {
  const platform = useNativePlatform()
  const baseId = useId()
  const [prefs, setPrefs] = useState(initial)
  const [permission, setPermission] = useState<PushPermission | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!platform) return
    let cancelled = false
    void pushPermission().then((p) => !cancelled && setPermission(p))
    return () => {
      cancelled = true
    }
  }, [platform])

  if (!platform || permission === null || permission === "unsupported") return null

  function turnOn() {
    markAsked()
    startTransition(async () => {
      try {
        setPermission(await requestAndRegister((token) => void saveToken(token)))
      } catch (error) {
        console.error(error)
        toast.error("Couldn't turn on notifications. Try again.")
      }
    })
  }

  async function change(key: keyof NotificationPrefs, on: boolean) {
    const before = prefs
    const next = { ...prefs, [key]: on }
    setPrefs(next)
    const error = actionError(await callAction(() => saveNotificationPrefs(next)))
    if (error) {
      setPrefs(before)
      toast.error(error)
    }
  }

  async function turnOffHere() {
    await forgetThisDevice()
    setPermission("prompt")
    toast.success("Notifications are off on this phone")
  }

  const settingsHint =
    platform === "ios"
      ? "Open Settings, then Notifications, then LazyChef, and allow notifications."
      : "Open Settings, then Apps, then LazyChef, then Notifications, and allow them."

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Pick what you want to hear about on this phone.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {permission === "granted" ? (
          <>
            {PREF_LABELS.map(({ key, title, hint }) => (
              <div key={key} className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3.5">
                <label htmlFor={`${baseId}-${key}`} className="grid flex-1 gap-0.5">
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-sm text-muted-foreground">{hint}</span>
                </label>
                <Switch id={`${baseId}-${key}`} checked={prefs[key]} onCheckedChange={(on) => void change(key, on)} />
              </div>
            ))}
            <Button type="button" variant="ghost" className="h-11" onClick={() => void turnOffHere()}>
              Turn off on this phone
            </Button>
          </>
        ) : permission === "denied" ? (
          <p className="text-sm text-muted-foreground">Notifications are blocked for LazyChef. {settingsHint}</p>
        ) : (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">Get a heads up before food goes bad, and when a housemate adds to the list.</p>
            <Button type="button" size="lg" onClick={turnOn} disabled={pending}>
              {pending ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <BellRing aria-hidden />}
              Turn on notifications
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
