"use client"

import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

import { BulkAddForm } from "./bulk-add-form"

/** Text and scan flag to start the sheet with; bump `n` to start it over (a new open). */
export type BulkAddSeed = { text: string; scan: boolean; n: number }

/**
 * "Just went shopping?": paste, type or scan a whole haul, check it, add it in one go.
 * A tall sheet on the Pantry screen (it used to be /pantry/add).
 */
export function BulkAddSheet({
  open,
  onOpenChange,
  seed,
  today,
  aiAvailable,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  seed: BulkAddSeed
  today: string
  aiAvailable: boolean
  onCloseAutoFocus?: (event: Event) => void
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} handleOnly>
      <DrawerContent
        className="mx-auto h-[92dvh] w-full max-w-lg data-[vaul-drawer-direction=bottom]:max-h-[92dvh]"
        onCloseAutoFocus={onCloseAutoFocus}
        // A big pasted list shouldn't vanish on a stray tap outside; the X and Escape close it.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DrawerHeader className="relative text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle className="pr-12 text-lg">Just went shopping?</DrawerTitle>
          <DrawerDescription>
            Scan, type or paste everything you bought. You&apos;ll check it all before anything is added.
          </DrawerDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 size-11"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden />
          </Button>
        </DrawerHeader>
        <div className="grid min-h-0 flex-1 content-start overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <BulkAddForm
            key={seed.n}
            defaultText={seed.text}
            serverToday={today}
            startScanning={seed.scan}
            aiAvailable={aiAvailable}
            onDone={() => onOpenChange(false)}
          />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
