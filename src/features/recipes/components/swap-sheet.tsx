"use client"

import { Ban, LoaderCircle, ShoppingBasket, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"

import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { displayName } from "@/features/pantry/display"
import { callAction } from "@/lib/call-action"

import { getSwaps } from "../substitute-actions"
import type { SwapResult } from "../substitute"

type State = { status: "loading" } | SwapResult

/** Bottom sheet of vetted swap ideas for one ingredient. */
export function SwapSheet({
  ingredient,
  recipeTitle,
  onClose,
}: {
  /** The ingredient to swap; null = closed. */
  ingredient: string | null
  recipeTitle: string
  onClose: () => void
}) {
  return (
    <Drawer open={ingredient !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto w-full max-w-lg">
        {ingredient !== null ? <SwapContent key={ingredient} ingredient={ingredient} recipeTitle={recipeTitle} /> : (
          <DrawerTitle className="sr-only">Swap an ingredient</DrawerTitle>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function SwapContent({ ingredient, recipeTitle }: { ingredient: string; recipeTitle: string }) {
  const [state, setState] = useState<State>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    void callAction(() => getSwaps(ingredient, recipeTitle)).then((result) => {
      if (cancelled) return
      setState("error" in result ? { status: "error", message: result.error } : result)
    })
    return () => {
      cancelled = true
    }
  }, [ingredient, recipeTitle])

  return (
    <>
      <DrawerHeader className="text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <DrawerTitle className="text-lg">Swap {displayName(ingredient).toLowerCase()}</DrawerTitle>
        <DrawerDescription>Only swaps that do the same job in this recipe.</DrawerDescription>
      </DrawerHeader>
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" data-vaul-no-drag>
        {state.status === "loading" ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Finding a swap…
          </p>
        ) : state.status === "error" ? (
          <p className="flex gap-2 rounded-xl border border-destructive/30 p-3.5 text-sm text-destructive" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.message}
          </p>
        ) : state.status === "none" ? (
          <div className="grid gap-1 rounded-xl border bg-muted/40 p-4" role="status">
            <p className="flex items-center gap-2 font-semibold">
              <Ban className="size-4" aria-hidden /> No good swap
            </p>
            <p className="text-sm text-muted-foreground">{state.reason}</p>
          </div>
        ) : (
          <ul className="grid gap-2.5" aria-label="Swap ideas">
            {state.swaps.map((swap) => (
              <li key={swap.id} className="grid gap-1 rounded-xl border bg-card p-3.5">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 font-semibold">{swap.name}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {swap.inPantry ? "In your pantry" : "Buy"}
                  </span>
                </div>
                <p className="flex items-center gap-1.5 text-sm">
                  <ShoppingBasket className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> Use {swap.ratio}
                </p>
                <p className="text-sm text-muted-foreground">{swap.why ?? swap.note}</p>
                {swap.why ? <p className="text-xs text-muted-foreground">{swap.note}</p> : null}
                {swap.allergens.length > 0 ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="size-3.5" aria-hidden /> Contains {swap.allergens.join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
