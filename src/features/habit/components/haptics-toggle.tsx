"use client"

import { useId, useSyncExternalStore } from "react"

import { Switch } from "@/components/ui/switch"
import { getHapticsEnabled, haptic, setHapticsEnabled, subscribeHapticsEnabled } from "@/lib/native/haptics"

/** "Haptics" on/off. Stored on this device only. Mount it on the Household screen. */
export function HapticsToggle() {
  const id = useId()
  const enabled = useSyncExternalStore(subscribeHapticsEnabled, getHapticsEnabled, () => true)
  return (
    <div className="flex min-h-12 items-center gap-3">
      <label htmlFor={id} className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-medium">Haptics</span>
        <span className="text-sm text-muted-foreground">A little buzz when you cook or check things off.</span>
      </label>
      <Switch
        id={id}
        checked={enabled}
        onCheckedChange={(on) => {
          setHapticsEnabled(on)
          if (on) haptic("tap")
        }}
      />
    </div>
  )
}
