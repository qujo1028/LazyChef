"use client"

import { BellRing, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { listenForPushTaps, pushPermission, requestAndRegister } from "@/lib/native/push"

import { registerThisDevice, saveToken } from "../device"
import { markAsked, onOfferPush, wasAsked } from "../offer"

/**
 * App-only; renders nothing in a browser. Inside the signed-in app it (1) sends people to the
 * right screen when they tap a push, (2) refreshes this phone's token and time zone on every
 * open when notifications are already allowed, and (3) after their first pantry add, offers a
 * short explanation before the system permission question (never on first launch).
 */
export function PushBridge() {
  const router = useRouter()
  const [offering, setOffering] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => listenForPushTaps((path) => router.push(path)), [router])

  useEffect(() => {
    let cancelled = false
    void pushPermission().then((permission) => {
      if (!cancelled && permission === "granted") void registerThisDevice((message) => console.error("Push registration failed:", message))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () =>
      onOfferPush(() => {
        if (wasAsked()) return
        void pushPermission().then((permission) => {
          if (permission === "prompt") setOffering(true)
        })
      }),
    [],
  )

  function turnOn() {
    markAsked()
    startTransition(async () => {
      try {
        const permission = await requestAndRegister((token) => void saveToken(token))
        if (permission === "denied") toast.message("Notifications are off. You can turn them on in your phone's Settings.")
        else if (permission === "granted") toast.success("Notifications are on")
      } catch (error) {
        console.error(error)
        toast.error("Couldn't turn on notifications. Try again from Household.")
      }
      setOffering(false)
    })
  }

  function notNow() {
    markAsked()
    setOffering(false)
  }

  return (
    <Drawer open={offering} onOpenChange={(open) => (open ? setOffering(true) : notNow())}>
      <DrawerContent className="mx-auto w-full max-w-lg">
        <DrawerHeader>
          <div className="mx-auto mb-1 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <BellRing className="size-6" aria-hidden />
          </div>
          <DrawerTitle>Get a heads up before food goes bad</DrawerTitle>
          <DrawerDescription>
            We&apos;ll nudge you when something in your pantry is about to expire, and when a housemate adds to the
            shopping list. You can choose which ones in Household.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button type="button" size="lg" onClick={turnOn} disabled={pending}>
            {pending ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
            Turn on notifications
          </Button>
          <Button type="button" size="lg" variant="ghost" onClick={notNow} disabled={pending}>
            Not now
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
